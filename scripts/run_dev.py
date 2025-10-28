#!/usr/bin/env python3
"""Launch the FastAPI backend and the graph designer UI in one terminal."""
from __future__ import annotations

import argparse
import asyncio
import signal
import sys
from pathlib import Path
from typing import Iterable, Sequence

import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
UI_DIR = ROOT / "ui" / "hbd_designer"


class CommandError(RuntimeError):
    pass


IS_WINDOWS = sys.platform.startswith("win")


async def _spawn_process(
    cmd: Sequence[str],
    *,
    cwd: Path | None = None,
) -> asyncio.subprocess.Process:
    if IS_WINDOWS:
        command_line = subprocess.list2cmdline(list(cmd))
        return await asyncio.create_subprocess_shell(
            command_line,
            cwd=str(cwd) if cwd else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

    return await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(cwd) if cwd else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )


async def run_command(
    cmd: Sequence[str],
    *,
    cwd: Path | None = None,
    prefix: str,
) -> None:
    process = await _spawn_process(cmd, cwd=cwd)

    async def stream(stream: asyncio.StreamReader, label: str) -> None:
        while True:
            line = await stream.readline()
            if not line:
                break
            text = line.decode(errors="replace").rstrip()
            print(f"[{prefix}:{label}] {text}")

    stdout_task = asyncio.create_task(stream(process.stdout, "out"))
    stderr_task = asyncio.create_task(stream(process.stderr, "err"))

    returncode = await process.wait()
    await asyncio.gather(stdout_task, stderr_task)

    if returncode != 0:
        raise CommandError(
            f"Command {' '.join(cmd)} exited with code {returncode}"
        )


async def ensure_ui_dependencies() -> None:
    if not UI_DIR.exists():
        raise CommandError("UI project directory ui/hbd_designer was not found.")

    if shutil.which("npm") is None:
        raise CommandError("npm is required to install and run the UI project.")

    node_modules = UI_DIR / "node_modules"
    if node_modules.exists():
        return

    print("[setup] node_modules not found; running npm install...")
    await run_command(["npm", "install"], cwd=UI_DIR, prefix="ui-setup")


async def launch_process(
    cmd: Sequence[str],
    *,
    cwd: Path | None,
    prefix: str,
    stop: asyncio.Event,
) -> tuple[asyncio.Task[None], asyncio.Task[None]]:
    process = await _spawn_process(cmd, cwd=cwd)

    async def pump(stream: asyncio.StreamReader, label: str) -> None:
        while True:
            line = await stream.readline()
            if not line:
                break
            text = line.decode(errors="replace").rstrip()
            print(f"[{prefix}:{label}] {text}")

    stdout_task = asyncio.create_task(pump(process.stdout, "out"))
    stderr_task = asyncio.create_task(pump(process.stderr, "err"))

    async def wait_for_process() -> int:
        returncode = await process.wait()
        await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
        print(f"[{prefix}] exited with code {returncode}")
        stop.set()
        return returncode

    wait_task = asyncio.create_task(wait_for_process())

    async def stop_watcher() -> None:
        await stop.wait()
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()

    stop_task = asyncio.create_task(stop_watcher())

    return wait_task, stop_task


async def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--backend-host",
        default="127.0.0.1",
        help="Host interface for the FastAPI server (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--backend-port",
        default="8000",
        help="Port for the FastAPI server (default: 8000)",
    )
    parser.add_argument(
        "--ui-host",
        default="localhost",
        help="Host interface to bind the Vite dev server (default: localhost)",
    )
    parser.add_argument(
        "--ui-port",
        default="5173",
        help="Port for the Vite dev server (default: 5173)",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    await ensure_ui_dependencies()

    for binary in ("uvicorn",):
        if shutil.which(binary) is None:
            raise CommandError(
                f"{binary} is not available. Did you run 'poetry install'?"
            )

    stop_event = asyncio.Event()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_running_loop().add_signal_handler(sig, stop_event.set)
        except NotImplementedError:  # pragma: no cover (Windows)
            signal.signal(sig, lambda *_: stop_event.set())

    backend_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "api.app:app",
        "--reload",
        "--host",
        args.backend_host,
        "--port",
        str(args.backend_port),
    ]
    ui_cmd = [
        "npm",
        "run",
        "dev",
        "--",
        "--host",
        args.ui_host,
        "--port",
        str(args.ui_port),
    ]

    print("Starting FastAPI backend and graph designer UI...")

    watcher_groups = await asyncio.gather(
        launch_process(backend_cmd, cwd=ROOT, prefix="api", stop=stop_event),
        launch_process(ui_cmd, cwd=UI_DIR, prefix="ui", stop=stop_event),
    )
    watchers = [task for group in watcher_groups for task in group]

    await stop_event.wait()

    await asyncio.gather(*watchers, return_exceptions=True)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except CommandError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)

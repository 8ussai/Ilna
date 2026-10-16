"""One background worker for the heavy AI work (indexing, transcription).

Each job uses most of the CPU (or the GPU), so they run one at a time, in order,
instead of side by side in FastAPI's request thread pool.
Jobs live in memory: unfinished work is found again from the database on startup.
"""
import queue
import threading
import traceback

_queue = queue.Queue()
_start_lock = threading.Lock()
_worker = None


def _run():
    while True:
        job, args = _queue.get()
        try:
            job(*args)
        except Exception:
            # a job reports its own failures; this only keeps the worker alive if one slips through
            traceback.print_exc()


def submit(job, *args):
    global _worker
    with _start_lock:
        if _worker is None:
            _worker = threading.Thread(target=_run, name="ai-jobs", daemon=True)
            _worker.start()
    _queue.put((job, args))

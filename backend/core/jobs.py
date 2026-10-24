"""Two background lines for the heavy AI work: one transcribes recordings, one indexes text for AI search.

Each line runs one job at a time, so a PDF never waits behind a lecture that's being transcribed.
When a line is free it starts the waiting job with the lowest score:

    estimated seconds - seconds waited + seconds of work this user got from the line lately

so small jobs go first, a long job moves up the longer it waits (it can't be skipped forever),
and users take turns instead of one person's uploads filling the line. A running job is never interrupted.
Jobs live in memory: unfinished work is found again from the database on startup.
"""

import itertools
import threading
import time
import traceback
from collections import deque
from dataclasses import dataclass
from typing import Callable, Optional

from backend.config import JOB_TURN_WINDOW_SEC

TRANSCRIBE = "transcribe"
INDEX = "index"


@dataclass
class Job:
    fn: Callable
    args: tuple
    user_id: Optional[int]
    estimate_sec: float
    queued_at: float
    # submission order, so equal scores keep first come, first served
    order: int


def score(job: Job, now: float, recent_work: dict) -> float:
    """Lower runs sooner: small, long-waiting jobs of users who haven't had a turn lately."""
    return job.estimate_sec - (now - job.queued_at) + recent_work.get(job.user_id, 0.0)


# the job a free line starts next
def pick(waiting: list, now: float, recent_work: dict) -> Job:
    return min(waiting, key=lambda job: (score(job, now, recent_work), job.order))


class _Line:
    """One worker thread and its waiting jobs."""

    def __init__(self, name: str):
        self.name = name
        self._cond = threading.Condition()
        self._waiting: list[Job] = []
        # (finished at, user, seconds the job ran), for taking turns
        self._done: deque = deque()
        self._worker = None

    def submit(self, job: Job):
        with self._cond:
            self._waiting.append(job)
            if self._worker is None:
                self._worker = threading.Thread(target=self._run, name=f"ai-{self.name}", daemon=True)
                self._worker.start()
            self._cond.notify()

    # seconds of work each user got from this line within the turn window
    def _recent_work(self, now: float) -> dict:
        while self._done and self._done[0][0] < now - JOB_TURN_WINDOW_SEC:
            self._done.popleft()
        work: dict = {}
        for _, user_id, seconds in self._done:
            work[user_id] = work.get(user_id, 0.0) + seconds
        return work

    # the worker: starts the best waiting job whenever the line is free, forever
    def _run(self):
        while True:
            with self._cond:
                while not self._waiting:
                    self._cond.wait()
                now = time.monotonic()
                job = pick(self._waiting, now, self._recent_work(now))
                self._waiting.remove(job)
                left = len(self._waiting)
            print(
                f"[Jobs] {self.name}: {job.fn.__name__}{job.args} for user {job.user_id} "
                f"(~{job.estimate_sec:.0f}s, waited {now - job.queued_at:.0f}s, {left} waiting)"
            )
            started = time.monotonic()
            try:
                job.fn(*job.args)
            except Exception:
                # a job reports its own failures; this only keeps the worker alive if one slips through
                traceback.print_exc()
            finished = time.monotonic()
            with self._cond:
                self._done.append((finished, job.user_id, finished - started))


_lines = {TRANSCRIBE: _Line(TRANSCRIBE), INDEX: _Line(INDEX)}
_order = itertools.count()


def submit(fn: Callable, *args, line: str = INDEX, user_id: Optional[int] = None, estimate_sec: float = 0.0):
    """Queues fn(*args) on a line. user_id is whose turn it uses; estimate_sec is roughly how long it'll run."""
    job = Job(fn, args, user_id, max(0.0, float(estimate_sec)), time.monotonic(), next(_order))
    _lines[line].submit(job)

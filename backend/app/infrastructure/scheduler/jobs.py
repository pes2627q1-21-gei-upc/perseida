from app.domain.scheduler.ports import JobScheduler


def register_jobs(scheduler: JobScheduler) -> None:
    """Single place where periodic jobs are registered.

    Each feature adds its own line here (e.g. ``scheduler.add_interval_job(...)``);
    the scheduler configuration is never touched.
    """

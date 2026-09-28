"""Errors a converter raises to reject a job with a specific HTTP status."""


class ConversionRejected(Exception):
    """Deterministic failure: the dispatcher must not retry it on the peer.

    400 — invalid or unsupported input, 413 — over a size/dimension limit,
    422 — valid input that could not be converted.
    """

    def __init__(self, status_code: int, detail: str, code: str = "rejected"):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.code = code


class EngineUnavailable(Exception):
    """The conversion engine itself is missing or broken on this instance.

    Mapped to 503 so the dispatcher fails over to the peer instance.
    """

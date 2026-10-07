"""Structured pipeline failure: every stop reports SOURCE/ERROR/CAUSE/ACTION."""


class StageStop(Exception):
    """Raised when a stage must stop instead of improvising."""

    def __init__(self, source: str, error: str, cause: str, required_action: str):
        self.source = source
        self.error = error
        self.cause = cause
        self.required_action = required_action
        super().__init__(
            f"SOURCE: {source} | ERROR: {error} | CAUSE: {cause} | "
            f"REQUIRED ACTION: {required_action}"
        )

    def as_dict(self) -> dict:
        return {
            "source": self.source,
            "error": self.error,
            "cause": self.cause,
            "required_action": self.required_action,
        }

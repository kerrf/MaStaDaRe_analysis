# zentrale Parameter und Pfade

"""
Auxiliary functions, constants, and constant instances (i.e. root logger)

"""
import logging
from logging.handlers import RotatingFileHandler
import sys


def setup_logging(
        level_cli: int = logging.INFO,
        level_applog: int = logging.INFO,
        log_file: str = "app.log"
) -> None:

    # 1. Create a logger
    root = logging.getLogger()
    root.setLevel(level_cli)

    # 3. Create formatter - how the outputs should look like
    formatter = logging.Formatter(
        "{asctime} {levelname} {filename}:{lineno} : {message}",
        style="{",
        datefmt="%Y-%m-%d %H:%M",
    )

    # 4. Create a console handler (output to terminal)
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(level_applog)
    console_handler.setFormatter(formatter)

    # 5. Create a file handler - rotates when big
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=1_000_000,
        backupCount=3,
        encoding="utf-8"
    )
    file_handler.setFormatter(formatter)

    # 6. Add handlers
    if not root.handlers:
        root.addHandler(console_handler)
        root.addHandler(file_handler)

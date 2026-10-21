import os


# deletes files from disk; call it after the commit, so a failed delete never leaves rows pointing at missing files
def remove_files(paths: list[str]) -> None:
    for path in paths:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass

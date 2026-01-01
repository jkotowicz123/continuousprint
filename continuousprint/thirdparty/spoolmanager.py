from octoprint.server import app
import json


class SpoolManagerException(Exception):
    pass


class SpoolManagerIntegration:
    def __init__(self, impl, logger):
        self._logger = logger
        self._impl = impl

    def get_materials(self):
        try:
            materials = self._impl.api_getSelectedSpoolInformations()
            materials = [
                f"{m['material']}_{m['colorName']}_{m['color']}"
                if m is not None
                else None
                for m in materials
            ]
            return materials
        except Exception as e:
            self._logger.warning(
                f"Skipping material assignment due to SpoolManager error: {e}"
            )
            return []

    def get_spools_info(self):
        """Get full spool information including name, remaining weight, and storage location."""
        try:
            spools = self._impl.api_getSelectedSpoolInformations()
            result = []
            for s in spools:
                if s is not None:
                    result.append(dict(
                        databaseId=s.get('databaseId'),
                        spoolName=s.get('displayName') or s.get('spoolName', ''),
                        material=s.get('material', ''),
                        colorName=s.get('colorName', ''),
                        color=s.get('color', ''),
                        remainingWeight=s.get('remainingWeight'),
                        storageLocation=s.get('storageLocation', ''),
                    ))
                else:
                    result.append(None)
            return result
        except Exception as e:
            self._logger.warning(
                f"Skipping spool info due to SpoolManager error: {e}"
            )
            return []

    def allowed_to_print(self):
        with app.app_context():
            r = self._impl.allowed_to_print()
        if r.status_code != 200:
            raise SpoolManagerException(
                f"SpoolManager allowed_to_print() error: {r.data}"
            )
        return json.loads(r.data)

    def start_print_confirmed(self):
        with app.app_context():
            r = self._impl.start_print_confirmed()
        if r.status_code != 200:
            raise SpoolManagerException(
                f"SpoolManager error {r.status_code} on print start: {r.data}"
            )
        return json.loads(r.data)

"""Stable error codes of the observation zones (TG-70, ADR-0018).

All of them are raised as ValidationError (422).
"""

# A latitude outside [-90, 90] (criterion 4).
OBSERVATION_ZONE_LATITUDE_INVALID = "OBSERVATION_ZONE_LATITUDE_INVALID"
# A longitude outside [-180, 180] (criterion 4).
OBSERVATION_ZONE_LONGITUDE_INVALID = "OBSERVATION_ZONE_LONGITUDE_INVALID"
# A search radius that is not greater than 0 km (criterion 4).
OBSERVATION_ZONE_RADIUS_INVALID = "OBSERVATION_ZONE_RADIUS_INVALID"

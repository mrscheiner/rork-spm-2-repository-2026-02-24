export const CANONICAL_DATA_VERSION = '2.0';

export const CANONICAL_VERSION_KEY = '@canonical_data_version';

export const APP_STORAGE_KEYS = [
  'season_passes',
  'active_season_pass_id',
  'data_imported_v1',
  'master_backup_v1',
  'all_passes_backup_v1',
] as const;

export const STORAGE_KEY_PREFIX = 'seasonpass_v2';

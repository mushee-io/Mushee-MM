-- The explorer now includes index, metal and rate categories. No quotes or
-- licences are granted by this migration. Entitlements remain opt-in.
ALTER TABLE licensed_entitlements
  DROP CONSTRAINT IF EXISTS licensed_entitlements_asset_class_check;
ALTER TABLE licensed_entitlements
  ADD CONSTRAINT licensed_entitlements_asset_class_check
  CHECK (asset_class IN (
    'equity','fx','commodity','bond','derivative','rwa','index','metal','rate'
  ));

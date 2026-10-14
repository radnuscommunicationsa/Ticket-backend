// One-time backfill of asset history.
// Place this file at:  backend/scripts/seedHistory.js
// Run from the BACKEND folder:  node scripts/seedHistory.js

const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']); // same DNS fix as server.js (needed for Atlas)
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const mongoose = require('mongoose');
const Asset = require('../models/Asset');
const AssetHistory = require('../models/AssetHistory');

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  process.env.DB_URI;

(async () => {
  if (!MONGO_URI) {
    console.error('No MongoDB URL found in .env (MONGO_URI / MONGODB_URI).');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('Connected to database');

  // Remove rows from any earlier import so the script can be re-run safely
  const removed = await AssetHistory.deleteMany({
    done_by: 'System',
    reason: /imported/i,
  });
  console.log(`Removed ${removed.deletedCount} old imported entries`);

  const assets = await Asset.find();

  let added = 0;
  let skipped = 0;

  for (const a of assets) {
    // Skip assets that already have real history
    const exists = await AssetHistory.findOne({ asset: a._id });
    if (exists) {
      skipped++;
      continue;
    }

    const base = {
      asset: a._id,
      asset_code: a.asset_code,
      asset_name: a.name,
      done_by: 'System',
    };

    const createdAt = new Date(a.createdAt || Date.now());

    // 1. Created
    await AssetHistory.create({
      ...base,
      action: 'Created',
      reason: 'Asset created (imported)',
      date: createdAt,
    });
    added++;

    const hasName = !!(a.assigned_to_name && String(a.assigned_to_name).trim());

    if (a.assigned_to || hasName) {
      // Assigned must not be before Created
      const assignedAt = new Date(
        Math.max(
          new Date(a.assigned_date || createdAt).getTime(),
          createdAt.getTime() + 1000
        )
      );

      // 2. Assigned
      await AssetHistory.create({
        ...base,
        action: 'Assigned',
        employee: a.assigned_to || null,
        employee_name: a.assigned_to_name,
        reason: 'Existing assignment (imported)',
        date: assignedAt,
      });
      added++;

      // 3. Old data: no holder id but a name is left -> it was assigned and later unassigned
      if (!a.assigned_to) {
        const unassignedAt = new Date(
          Math.max(
            new Date(a.updatedAt || assignedAt).getTime(),
            assignedAt.getTime() + 60 * 1000
          )
        );

        await AssetHistory.create({
          ...base,
          action: 'Unassigned',
          employee: null,
          employee_name: a.assigned_to_name,
          reason: 'Historical unassign (imported)',
          date: unassignedAt,
        });
        added++;
      }
    }
  }

  console.log(`Done. ${added} entries added, ${skipped} assets skipped.`);
  process.exit(0);
})().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
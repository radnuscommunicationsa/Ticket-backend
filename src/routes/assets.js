
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Asset = require('../models/Asset');
const AssetHistory = require('../models/AssetHistory');
const TakeHomeRequest = require('../models/TakeHomeRequest');

/* =========================================================
   HELPERS
========================================================= */

const DATE_FIELDS = ['purchase_date', 'warranty_until'];

const EDITABLE = [
  'asset_code',
  'name',
  'serial_no',
  'category',
  'brand',
  'model',
  'purchase_date',
  'warranty_until',
  'location',
  'notes',
  'status',
  'sim_number',
  'sim_provider',
  'specs',
];

const doneBy = (req) =>
  req.user?.name ||
  req.user?.full_name ||
  req.user?.email ||
  'Admin';

function pickFields(body = {}) {
  const out = {};

  EDITABLE.forEach((key) => {
    if (body[key] === undefined) return;

    out[key] = DATE_FIELDS.includes(key)
      ? (body[key] || null)
      : body[key];
  });

  return out;
}

function getEmployeeId(req) {
  return req.user?._id || req.user?.id || req.user?.userId || null;
}

async function findPerson(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }

  for (const modelName of ['Employee', 'Admin', 'User']) {
    const M = mongoose.models[modelName];
    if (!M) continue;

    const person = await M.findById(id).lean();
    if (person) return person;
  }

  return null;
}

const personName = (p) =>
  p?.name || p?.full_name || p?.username || '';

const logHistory = (asset, data) =>
  AssetHistory.create({
    asset: asset._id,
    asset_code: asset.asset_code,
    asset_name: asset.name,
    ...data,
  });

/* =========================================================
   MY ASSETS
   GET /api/assets/my-assets
========================================================= */

router.get('/my-assets', async (req, res) => {
  try {
    const employeeId = getEmployeeId(req);

    if (!employeeId || !mongoose.Types.ObjectId.isValid(String(employeeId))) {
      return res.status(401).json({
        message: 'Login required to view assigned assets.',
      });
    }

    const assets = await Asset.find({
      assigned_to: employeeId,
    })
      .sort({ createdAt: -1 })
      .lean();

        return res.json({ assets });
  } catch (err) {
    console.error('My assets error:', err);
    return res.status(500).json({
      message: 'Failed to load assigned assets.',
    });
  }
});

/* =========================================================
   MY TAKE-HOME REQUESTS
   GET /api/assets/take-home-requests/my
========================================================= */

router.get('/take-home-requests/my', async (req, res) => {
  try {
    const employeeId = getEmployeeId(req);

    if (!employeeId || !mongoose.Types.ObjectId.isValid(String(employeeId))) {
      return res.status(401).json({
        message: 'Login required to view your requests.',
      });
    }

    const requests = await TakeHomeRequest.find({
      employee_id: employeeId,
    })
      .populate('asset_id')
      .sort({ created_at: -1 })
      .lean();

        return res.json({ requests });
  } catch (err) {
    console.error('My take-home requests error:', err);
    return res.status(500).json({
      message: 'Failed to load take-home requests.',
    });
  }
});

/* =========================================================
   CREATE TAKE-HOME REQUEST
   POST /api/assets/take-home-requests
========================================================= */

router.post('/take-home-requests', async (req, res) => {
  try {
    const employeeId = getEmployeeId(req);

    if (!employeeId || !mongoose.Types.ObjectId.isValid(String(employeeId))) {
      return res.status(401).json({
        message: 'Login required to submit a request.',
      });
    }

    const {
      asset_id,
      asset_type,
      reason,
      from_date,
      to_date,
      is_permanent,
      emergency_contact,
      emergency_phone,
    } = req.body;

    if (
      !asset_id ||
      !mongoose.Types.ObjectId.isValid(String(asset_id)) ||
      !reason?.trim() ||
      !from_date ||
      !to_date ||
      !emergency_phone?.trim()
    ) {
      return res.status(400).json({
        message: 'Please provide valid asset, reason, dates and emergency phone.',
      });
    }

    const startDate = new Date(from_date);
    const endDate = new Date(to_date);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      return res.status(400).json({
        message: 'Invalid request dates.',
      });
    }

    if (endDate < startDate) {
      return res.status(400).json({
        message: 'To date cannot be earlier than from date.',
      });
    }

    const asset = await Asset.findById(asset_id);

    if (!asset) {
      return res.status(404).json({
        message: 'Asset not found.',
      });
    }

    if (String(asset.assigned_to) !== String(employeeId)) {
      return res.status(403).json({
        message: 'You can request only assets assigned to you.',
      });
    }

    const request = await TakeHomeRequest.create({
      employee_id: employeeId,
      asset_id: asset._id,
      asset_type: asset_type || asset.category || '',
      reason: reason.trim(),
      from_date: startDate,
      to_date: endDate,
      is_permanent: is_permanent === true || is_permanent === 'true',
      emergency_contact: emergency_contact || '',
      emergency_phone: emergency_phone.trim(),
    });

    return res.status(201).json({
      message: 'Take-home request submitted successfully.',
      request,
    });
  } catch (err) {
    console.error('Create take-home request error:', err);

    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: err.message,
      });
    }

    return res.status(500).json({
      message: 'Failed to submit take-home request.',
    });
  }
});

/* =========================================================
   PENDING TAKE-HOME REQUEST COUNT
   GET /api/assets/take-home-requests/pending-count
========================================================= */

router.get('/take-home-requests/pending-count', async (req, res) => {
  try {
    const count = await TakeHomeRequest.countDocuments({
      status: 'pending',
    });

    return res.json({ count });
  } catch (err) {
    console.error('Pending take-home count error:', err);

    return res.status(500).json({
      error: 'Failed to fetch pending take-home request count.',
    });
  }
});

/* =========================================================
   ALL TAKE-HOME REQUESTS (ADMIN)
   GET /api/assets/take-home-requests
========================================================= */

router.get('/take-home-requests', async (req, res) => {
  try {
    const requests = await TakeHomeRequest.find()
      .populate('employee_id', 'name emp_id department')
      .populate('asset_id', 'asset_code name model')
      .sort({ created_at: -1 })
      .lean();

    return res.json({ requests });
  } catch (err) {
    console.error('All take-home requests error:', err);
    return res.status(500).json({ error: 'Failed to load take-home requests.' });
  }
});

/* =========================================================
   UPDATE TAKE-HOME REQUEST STATUS
   PATCH /api/assets/take-home-requests/:id/status
========================================================= */

router.patch('/take-home-requests/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const allowed = ['pending', 'approved_by_manager', 'approved', 'rejected', 'returned'];

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid request id.' });
    }
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const request = await TakeHomeRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    request.status = status;
    if (notes) request.notes = notes;
    await request.save();

    return res.json({ request });
  } catch (err) {
    console.error('Update take-home status error:', err);
    return res.status(500).json({ error: 'Failed to update request.' });
  }
});

/* =========================================================
   DELETE TAKE-HOME REQUEST
   DELETE /api/assets/take-home-requests/:id
========================================================= */

router.delete('/take-home-requests/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid request id.' });
    }

    const request = await TakeHomeRequest.findByIdAndDelete(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    return res.json({ message: 'Request deleted.' });
  } catch (err) {
    console.error('Delete take-home request error:', err);
    return res.status(500).json({ error: 'Failed to delete request.' });
  }
});

/* =========================================================
   HISTORY OF ONE PERSON (all assets)
   GET /api/assets/employee/:employeeId/history
========================================================= */

router.get('/employee/:employeeId/history', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.employeeId)) {
      return res.status(400).json({ error: 'Invalid employee id.' });
    }

    const history = await AssetHistory.find({
      employee: req.params.employeeId,
    })
      .sort({ date: -1 })
      .lean();

    return res.json({ history });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   GET ALL ASSETS (+ STATS)
========================================================= */

router.get('/', async (req, res) => {
  try {
    const assets = await Asset.find()
      .sort({ createdAt: -1 })
      .lean();

    const stats = {
      total: assets.length,
      available: assets.filter((a) => a.status === 'Available').length,
      assigned: assets.filter((a) => a.status === 'Assigned').length,
      repair: assets.filter(
        (a) => a.status === 'Under Repair' || a.status === 'Damaged'
      ).length,
    };

    return res.json({ assets, stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   FIND & REPLACE CATEGORY
========================================================= */

router.patch('/find-replace', async (req, res) => {
  try {
    const { find, replace } = req.body;

    if (!find || !replace) {
      return res.status(400).json({
        error: 'Both categories are required.',
      });
    }

    const result = await Asset.updateMany(
      { category: find },
      { $set: { category: replace } }
    );

    return res.json({
      modified: result.modifiedCount ?? result.nModified ?? 0,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   CREATE ASSET
========================================================= */

router.post('/', async (req, res) => {
  try {
    const data = pickFields(req.body);

    if (!data.asset_code || !data.name) {
      return res.status(400).json({
        error: 'Asset code and asset name are required.',
      });
    }

    const dup = await Asset.findOne({
      asset_code: data.asset_code,
    });

    if (dup) {
      return res.status(400).json({
        error: `Asset code ${data.asset_code} already exists.`,
      });
    }

    const person = await findPerson(req.body.assigned_to);

    if (person) {
      data.assigned_to = person._id;
      data.assigned_to_name = personName(person);
      data.assigned_date = new Date();
      data.status = 'Assigned';
    } else if (data.status === 'Assigned') {
      data.status = 'Available';
    }

    const asset = await Asset.create(data);
    const now = Date.now();

    await logHistory(asset, {
      action: 'Created',
      reason: 'Asset created',
      done_by: doneBy(req),
      date: new Date(now),
    });

    if (person) {
      await logHistory(asset, {
        action: 'Assigned',
        employee: person._id,
        employee_name: personName(person),
        reason: 'Assigned while adding asset',
        done_by: doneBy(req),
        date: new Date(now + 1),
      });
    }

    return res.status(201).json(asset);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        error: 'This asset code already exists.',
      });
    }

    return res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   HISTORY OF ONE ASSET
========================================================= */

router.get('/:id/history', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid asset id.',
      });
    }

    const history = await AssetHistory.find({
      asset: req.params.id,
    })
      .sort({ date: -1 })
      .lean();

    return res.json({ history });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ASSIGN ASSET
========================================================= */

router.patch('/:id/assign', async (req, res) => {
  try {
    const { employee_id, reason } = req.body;

    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        error: 'Asset not found.',
      });
    }

    const person = await findPerson(employee_id);

    if (!person) {
      return res.status(404).json({
        error: 'Employee / Admin not found.',
      });
    }

    const now = Date.now();

    if (asset.assigned_to || asset.assigned_to_name) {
      await logHistory(asset, {
        action: 'Unassigned',
        employee: asset.assigned_to,
        employee_name: asset.assigned_to_name,
        reason: 'Reassigned',
        done_by: doneBy(req),
        date: new Date(now - 1),
      });
    }

    asset.assigned_to = person._id;
    asset.assigned_to_name = personName(person);
    asset.assigned_date = new Date(now);
    asset.status = 'Assigned';

    await asset.save();

    await logHistory(asset, {
      action: 'Assigned',
      employee: person._id,
      employee_name: personName(person),
      reason: reason || 'Assigned',
      done_by: doneBy(req),
      date: new Date(now),
    });

    return res.json(asset);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   UNASSIGN ASSET
========================================================= */

router.patch('/:id/unassign', async (req, res) => {
  try {
    const { reason } = req.body;

    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        error: 'Asset not found.',
      });
    }

    await logHistory(asset, {
      action: 'Unassigned',
      employee: asset.assigned_to,
      employee_name: asset.assigned_to_name,
      reason: reason || 'Unassigned',
      done_by: doneBy(req),
      date: new Date(),
    });

    asset.assigned_to = null;
    asset.assigned_to_name = '';
    asset.assigned_date = null;
    asset.status = 'Available';

    await asset.save();

    return res.json(asset);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   GET ONE ASSET
========================================================= */

router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid asset id.',
      });
    }

    const asset = await Asset.findById(req.params.id).lean();

    if (!asset) {
      return res.status(404).json({
        error: 'Asset not found.',
      });
    }

    return res.json(asset);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   UPDATE ASSET
========================================================= */

router.patch('/:id', async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        error: 'Asset not found.',
      });
    }

    const data = pickFields(req.body);

    if (data.asset_code && data.asset_code !== asset.asset_code) {
      const dup = await Asset.findOne({
        asset_code: data.asset_code,
        _id: { $ne: asset._id },
      });

      if (dup) {
        return res.status(400).json({
          error: `Asset code ${data.asset_code} already exists.`,
        });
      }
    }

    const oldStatus = asset.status;

    Object.assign(asset, data);
    await asset.save();

    if (data.status && data.status !== oldStatus) {
      await logHistory(asset, {
        action: 'Status Changed',
        reason: `${oldStatus} -> ${data.status}`,
        done_by: doneBy(req),
        date: new Date(),
      });
    }

    return res.json(asset);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   DELETE ASSET
========================================================= */

router.delete('/:id', async (req, res) => {
  try {
    const asset = await Asset.findByIdAndDelete(req.params.id);

    if (!asset) {
      return res.status(404).json({
        error: 'Asset not found.',
      });
    }

    return res.json({ message: 'Asset deleted.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;  
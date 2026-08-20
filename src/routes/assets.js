const router = require('express').Router();

const Asset = require('../models/Asset');
const Employee = require('../models/User');
const TakeHomeRequest = require('../models/TakeHomeRequest');
const Notification = require('../models/Notification');

const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');


// =========================================================
// FIND & REPLACE ASSET CATEGORY
// =========================================================

router.patch('/find-replace', async (req, res) => {
  try {
    const { find, replace } = req.body;

    if (!find || !replace) {
      return res.status(400).json({
        error: 'Find and Replace values are required'
      });
    }

    const assets = await Asset.find({
      category: {
        $regex: `^${find}$`,
        $options: 'i'
      }
    });

    let updated = 0;

    for (const asset of assets) {
      asset.category = replace;
      await asset.save();
      updated++;
    }

    res.json({
      success: true,
      message: `${updated} asset(s) updated: category changed from "${find}" to "${replace}"`
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});


// =========================================================
// GET MY ASSETS
// =========================================================

router.get('/my-assets', auth, async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const userId = user._id || user.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Invalid user session, please login again'
      });
    }

    const assets = await Asset.find({
      assigned_to: userId
    }).lean();

    res.json({
      assets
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});


// =========================================================
// GET ALL ASSETS
// =========================================================

router.get('/', auth, async (req, res) => {
  try {
    let filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.q) {
      const q = req.query.q;

      filter.$or = [
        {
          name: {
            $regex: q,
            $options: 'i'
          }
        },
        {
          asset_code: {
            $regex: q,
            $options: 'i'
          }
        },
        {
          brand: {
            $regex: q,
            $options: 'i'
          }
        },
        {
          model: {
            $regex: q,
            $options: 'i'
          }
        },
        {
          assigned_to_name: {
            $regex: q,
            $options: 'i'
          }
        }
      ];
    }

    const assets = await Asset.find(filter)
      .sort({
        createdAt: -1
      });

    const allAssets = await Asset.find({});

    const stats = {
      total: allAssets.length,

      available: allAssets.filter(
        a => a.status === 'Available'
      ).length,

      assigned: allAssets.filter(
        a => a.status === 'Assigned'
      ).length,

      repair: allAssets.filter(
        a =>
          a.status === 'Under Repair' ||
          a.status === 'Damaged'
      ).length
    };

    res.json({
      assets,
      stats
    });

  } catch (err) {
    console.error('GET /assets error:', err);

    res.status(500).json({
      error: err.message
    });
  }
});


// =========================================================
// ADD NEW ASSET
// =========================================================

router.post('/', auth, isAdmin, async (req, res) => {
  try {
    const existing = await Asset.findOne({
      asset_code: req.body.asset_code
    });

    if (existing) {
      return res.status(400).json({
        error: 'Asset code already exists'
      });
    }

    const asset = new Asset({
      ...req.body,
      assigned_to: null,
      assigned_to_name: null,
      assigned_date: null
    });

    await asset.save();

    res.json({
      success: true,
      asset
    });

  } catch (err) {
    console.error('POST /assets error:', err);

    res.status(500).json({
      error: err.message
    });
  }
});


// =========================================================
// ASSIGN ASSET TO EMPLOYEE
// =========================================================

router.patch('/:id/assign', auth, isAdmin, async (req, res) => {
  try {
    const { employee_id } = req.body;

    if (!employee_id) {
      return res.status(400).json({
        error: 'Employee ID is required'
      });
    }

    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        error: 'Asset not found'
      });
    }

    if (asset.status === 'Assigned') {
      return res.status(400).json({
        error: 'Asset is already assigned. Unassign it first.'
      });
    }

    const employee = await Employee.findById(employee_id);

    if (!employee) {
      return res.status(404).json({
        error: 'Employee not found'
      });
    }

    const empName = employee.name || employee.email;

    asset.status = 'Assigned';
    asset.assigned_to = employee_id;
    asset.assigned_to_name = empName;
    asset.assigned_date = new Date();

    await asset.save();

    res.json({
      success: true,
      message: `Asset assigned to ${empName}`,
      asset
    });

  } catch (err) {
    console.error('ASSIGN error:', err);

    res.status(500).json({
      error: err.message
    });
  }
});


// =========================================================
// UNASSIGN ASSET
// =========================================================

router.patch('/:id/unassign', auth, isAdmin, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({
        error: 'Asset not found'
      });
    }

    asset.status = 'Available';
    asset.assigned_to = null;
    asset.assigned_to_name = null;
    asset.assigned_date = null;

    await asset.save();

    res.json({
      success: true,
      message: 'Asset unassigned successfully',
      asset
    });

  } catch (err) {
    console.error('UNASSIGN error:', err);

    res.status(500).json({
      error: err.message
    });
  }
});


// =========================================================
// UPDATE ASSET
// =========================================================

router.patch('/:id', auth, isAdmin, async (req, res) => {
  try {
    const asset = await Asset.findByIdAndUpdate(
      req.params.id,
      {
        $set: req.body
      },
      {
        new: true
      }
    );

    if (!asset) {
      return res.status(404).json({
        error: 'Asset not found'
      });
    }

    res.json({
      success: true,
      asset
    });

  } catch (err) {
    console.error('PATCH /assets error:', err);

    res.status(500).json({
      error: err.message
    });
  }
});


// =========================================================
// DELETE ASSET
// =========================================================

router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const asset = await Asset.findByIdAndDelete(
      req.params.id
    );

    if (!asset) {
      return res.status(404).json({
        error: 'Asset not found'
      });
    }

    res.json({
      success: true,
      message: 'Asset deleted'
    });

  } catch (err) {
    console.error('DELETE /assets error:', err);

    res.status(500).json({
      error: err.message
    });
  }
});


// =========================================================
// TAKE-HOME REQUEST
// EMPLOYEE SUBMITS
// =========================================================

router.post('/take-home-requests', auth, async (req, res) => {
  try {

    const {
      asset_type,
      asset_id,
      reason,
      from_date,
      to_date,
      emergency_contact,
      emergency_phone
    } = req.body;


    // -----------------------------
    // VALIDATION
    // -----------------------------

    if (
      !asset_type ||
      !asset_id ||
      !reason ||
      !from_date ||
      !to_date ||
      !emergency_phone
    ) {
      return res.status(400).json({
        error: 'All required fields must be filled'
      });
    }


    if (reason.trim().length < 10) {
      return res.status(400).json({
        error: 'Reason must be at least 10 characters'
      });
    }


    const fromDate = new Date(from_date);
    const toDate = new Date(to_date);


    if (
      isNaN(fromDate.getTime()) ||
      isNaN(toDate.getTime())
    ) {
      return res.status(400).json({
        error: 'Invalid date format'
      });
    }


    if (toDate < fromDate) {
      return res.status(400).json({
        error: 'Return date must be after or same as from date'
      });
    }


    // -----------------------------
    // VERIFY ASSET
    // -----------------------------

    const asset = await Asset.findById(asset_id);

    if (!asset) {
      return res.status(404).json({
        error: 'Asset not found'
      });
    }


    const employeeId =
      req.user._id || req.user.id;


    // -----------------------------
    // CHECK ASSIGNED EMPLOYEE
    // -----------------------------

    const assignedToId = asset.assigned_to
      ? asset.assigned_to.toString()
      : null;


    if (
      assignedToId !== employeeId.toString()
    ) {
      return res.status(403).json({
        error: 'This asset is not assigned to you'
      });
    }


    // -----------------------------
    // CHECK EXISTING REQUEST
    // -----------------------------

    const existingRequest =
      await TakeHomeRequest.findOne({
        employee_id: employeeId,
        asset_id: asset_id,
        status: {
          $in: [
            'pending',
            'approved_by_manager',
            'approved'
          ]
        }
      });


    if (existingRequest) {
      return res.status(400).json({
        error:
          'You already have an active/pending take-home request for this asset'
      });
    }


    // -----------------------------
    // CREATE REQUEST
    // -----------------------------

    const request = new TakeHomeRequest({

      employee_id: employeeId,

      asset_id: asset_id,

      asset_type: asset_type,

      reason: reason.trim(),

      from_date: fromDate,

      to_date: toDate,

      emergency_contact:
        emergency_contact || req.user.name,

      emergency_phone:
        emergency_phone.trim(),

      status: 'pending',

      created_at: new Date()
    });


    await request.save();


    // =====================================================
    // 🔔 NOTIFY ADMIN
    // =====================================================

    const employee =
      await Employee.findById(employeeId)
        .select('name emp_id department');


    const employeeName =
      employee?.name ||
      employee?.emp_id ||
      'Employee';


    const assetName =
      asset.asset_code ||
      asset.name ||
      asset.model ||
      asset_type;


    const admins =
      await Employee.find({
        role: {
          $in: [
            'admin',
            'system_admin'
          ]
        }
      }).select('_id');


    await Promise.all(
      admins.map(admin =>
        Notification.create({
          message:
            `${employeeName} submitted a new take-home request for ${assetName}.`,

          type:
            'take_home_request',

          role:
            'admin',

          user_id:
            admin._id,

          is_read:
            false
        })
      )
    );


    // -----------------------------
    // RESPONSE
    // -----------------------------

    res.status(201).json({

      success: true,

      message:
        'Take-home request submitted successfully',

      request_id:
        request._id.toString(),

      request
    });


  } catch (err) {

    console.error(
      'POST /take-home-requests error:',
      err
    );

    res.status(500).json({
      error:
        err.message ||
        'Failed to submit request'
    });
  }
});


// =========================================================
// 🔔 TAKE-HOME PENDING COUNT
// ADMIN SIDEBAR BADGE
// =========================================================

router.get(
  '/take-home-requests/pending-count',
  auth,
  isAdmin,
  async (req, res) => {

    try {

      const count =
        await TakeHomeRequest.countDocuments({
          status: {
            $in: [
              'pending',
              'approved_by_manager'
            ]
          }
        });


      res.json({
        count
      });


    } catch (err) {

      console.error(
        'GET /take-home-requests/pending-count error:',
        err
      );

      res.status(500).json({
        error:
          err.message ||
          'Failed to get pending request count'
      });
    }
  }
);


// =========================================================
// GET MY TAKE-HOME REQUESTS
// EMPLOYEE
// =========================================================

router.get(
  '/take-home-requests/my',
  auth,
  async (req, res) => {

    try {

      const employeeId =
        req.user._id || req.user.id;


      const requests =
        await TakeHomeRequest.find({
          employee_id: employeeId
        })
        .populate(
          'asset_id',
          'asset_code name model category'
        )
        .sort({
          created_at: -1
        });


      res.json({
        requests
      });


    } catch (err) {

      console.error(
        'GET /take-home-requests/my error:',
        err
      );

      res.status(500).json({
        error: err.message
      });
    }
  }
);


// =========================================================
// GET ALL TAKE-HOME REQUESTS
// ADMIN / MANAGER
// =========================================================

router.get(
  '/take-home-requests',
  auth,
  isAdmin,
  async (req, res) => {

    try {

      const filter = {};


      if (req.query.status) {
        filter.status =
          req.query.status;
      }


      const requests =
        await TakeHomeRequest.find(filter)
        .populate(
          'employee_id',
          'name emp_id department'
        )
        .populate(
          'asset_id',
          'asset_code name model'
        )
        .sort({
          created_at: -1
        });


      res.json({
        requests
      });


    } catch (err) {

      console.error(
        'GET /take-home-requests error:',
        err
      );

      res.status(500).json({
        error: err.message
      });
    }
  }
);


// =========================================================
// APPROVE / REJECT TAKE-HOME REQUEST
// MANAGER / ADMIN
// =========================================================

router.patch(
  '/take-home-requests/:id/status',
  auth,
  async (req, res) => {

    try {

      const {
        status,
        notes
      } = req.body;


      const requestId =
        req.params.id;


      const approverId =
        req.user._id || req.user.id;


      const userRole =
        req.user.role;


      // -----------------------------
      // VALID STATUS
      // -----------------------------

      if (
        ![
          'approved_by_manager',
          'approved',
          'rejected',
          'returned'
        ].includes(status)
      ) {
        return res.status(400).json({
          error: 'Invalid status'
        });
      }


      // -----------------------------
      // FIND REQUEST
      // -----------------------------

      const request =
        await TakeHomeRequest.findById(
          requestId
        );


      if (!request) {
        return res.status(404).json({
          error: 'Request not found'
        });
      }


      // -----------------------------
      // ROLE BASED APPROVAL
      // -----------------------------

      if (
        status ===
        'approved_by_manager'
      ) {

        if (
          userRole !== 'admin' &&
          userRole !== 'system_admin' &&
          userRole !== 'manager'
        ) {
          return res.status(403).json({
            error:
              'Only managers can do initial approval'
          });
        }


        request.manager_approved_by =
          approverId;

      }


      else if (
        status === 'approved'
      ) {

        if (
          userRole !== 'admin' &&
          userRole !== 'system_admin'
        ) {
          return res.status(403).json({
            error:
              'Only IT admin can give final approval'
          });
        }


        request.it_approved_by =
          approverId;


        request.approved_at =
          new Date();

      }


      else if (
        status === 'rejected'
      ) {

        request.approved_at =
          null;

      }


      else if (
        status === 'returned'
      ) {

        request.returned_at =
          new Date();

      }


      // -----------------------------
      // SAVE STATUS
      // -----------------------------

      request.status =
        status;


      if (notes) {
        request.notes =
          notes;
      }


      await request.save();


      // =====================================================
      // 🔔 EMPLOYEE NOTIFICATION
      // =====================================================

      if (
        status ===
        'approved_by_manager'
      ) {

        await Notification.create({

          message:
            'Your take-home request has been approved by the manager and is waiting for IT approval.',

          type:
            'take_home_status',

          role:
            'employee',

          user_id:
            request.employee_id,

          is_read:
            false
        });


        // Notify admins for final approval
        const admins =
          await Employee.find({
            role: {
              $in: [
                'admin',
                'system_admin'
              ]
            }
          }).select('_id');


        await Promise.all(
          admins.map(admin =>
            Notification.create({

              message:
                'A take-home request is waiting for final IT approval.',

              type:
                'take_home_request',

              role:
                'admin',

              user_id:
                admin._id,

              is_read:
                false
            })
          )
        );
      }


      else if (
        status === 'approved'
      ) {

        await Notification.create({

          message:
            'Your take-home request has been fully approved and is ready for home use.',

          type:
            'take_home_status',

          role:
            'employee',

          user_id:
            request.employee_id,

          is_read:
            false
        });
      }


      else if (
        status === 'rejected'
      ) {

        await Notification.create({

          message:
            `Your take-home request was rejected.${notes ? ` Reason: ${notes}` : ''}`,

          type:
            'take_home_status',

          role:
            'employee',

          user_id:
            request.employee_id,

          is_read:
            false
        });
      }


      else if (
        status === 'returned'
      ) {

        await Notification.create({

          message:
            `Your take-home asset has been marked as returned.${notes ? ` ${notes}` : ''}`,

          type:
            'take_home_status',

          role:
            'employee',

          user_id:
            request.employee_id,

          is_read:
            false
        });
      }


      // -----------------------------
      // RESPONSE
      // -----------------------------

      res.json({

        success: true,

        message:
          `Request ${status.replace(
            /_/g,
            ' '
          )} successfully`,

        request
      });


    } catch (err) {

      console.error(
        'PATCH /take-home-requests/status error:',
        err
      );

      res.status(500).json({
        error: err.message
      });
    }
  }
);


// =========================================================
// DELETE TAKE-HOME REQUEST
// ADMIN ONLY
// =========================================================

router.delete(
  '/take-home-requests/:id',
  auth,
  isAdmin,
  async (req, res) => {

    try {

      const request =
        await TakeHomeRequest.findByIdAndDelete(
          req.params.id
        );


      if (!request) {
        return res.status(404).json({
          error: 'Request not found'
        });
      }


      res.json({
        success: true,
        message:
          'Request deleted successfully'
      });


    } catch (err) {

      console.error(
        'DELETE /take-home-requests error:',
        err
      );

      res.status(500).json({
        error: err.message
      });
    }
  }
);


module.exports = router;
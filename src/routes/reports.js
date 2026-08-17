const router = require('express').Router();

const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Asset = require('../models/Asset');


// ============================================================
// MONTHLY REPORT
// GET /reports?year=2026&month=8
// ============================================================

router.get('/', async (req, res) => {
  try {

    const { year, month } = req.query;

    // ========================================================
    // VALIDATION
    // ========================================================

    if (!year || !month) {
      return res.status(400).json({
        error: 'year and month are required'
      });
    }

    const selectedYear = Number(year);
    const selectedMonth = Number(month);

    if (
      Number.isNaN(selectedYear) ||
      Number.isNaN(selectedMonth) ||
      selectedMonth < 1 ||
      selectedMonth > 12
    ) {
      return res.status(400).json({
        error: 'Invalid year or month'
      });
    }


    // ========================================================
    // DATE RANGE
    // ========================================================

    const start = new Date(
      selectedYear,
      selectedMonth - 1,
      1
    );

    const end = new Date(
      selectedYear,
      selectedMonth,
      1
    );


    // ========================================================
    // GET ALL TICKETS FOR SELECTED MONTH
    // ========================================================

    const monthlyTickets = await Ticket
      .find({
        createdAt: {
          $gte: start,
          $lt: end
        }
      })
      .lean();


    // ========================================================
    // TICKET SUMMARY
    // ========================================================

    const total = monthlyTickets.length;

    const open_c = monthlyTickets.filter(
      ticket => ticket.status === 'open'
    ).length;

    const inprog = monthlyTickets.filter(
      ticket => ticket.status === 'in-progress'
    ).length;

    const resolved = monthlyTickets.filter(
      ticket => ticket.status === 'resolved'
    ).length;

    const closed = monthlyTickets.filter(
      ticket => ticket.status === 'closed'
    ).length;


    // ========================================================
    // PENDING TICKETS
    //
    // Open + In Progress
    // ========================================================

    const pending =
      open_c + inprog;


    // ========================================================
    // RESOLUTION / COMPLETION RATE
    //
    // Resolved + Closed = Completed
    //
    // Example:
    // Total = 18
    // Resolved = 0
    // Closed = 18
    //
    // Completion = 18 / 18 = 100%
    // ========================================================

    const completed =
      resolved + closed;

    const resolutionRate =
      total > 0
        ? Math.round(
            (completed / total) * 100
          )
        : 0;


    // Resolved-only percentage
    const resolvedOnlyRate =
      total > 0
        ? Math.round(
            (resolved / total) * 100
          )
        : 0;


    // Closed percentage
    const closureRate =
      total > 0
        ? Math.round(
            (closed / total) * 100
          )
        : 0;


    // ========================================================
    // PRIORITY ANALYSIS
    // ========================================================

    const critical =
      monthlyTickets.filter(
        ticket => ticket.priority === 'critical'
      ).length;

    const high =
      monthlyTickets.filter(
        ticket => ticket.priority === 'high'
      ).length;

    const medium =
      monthlyTickets.filter(
        ticket => ticket.priority === 'medium'
      ).length;

    const low =
      monthlyTickets.filter(
        ticket => ticket.priority === 'low'
      ).length;


    // ========================================================
    // PRIORITY PERCENTAGES
    // ========================================================

    const priorityPercentage = (count) => {
      return total > 0
        ? Math.round(
            (count / total) * 100
          )
        : 0;
    };


    const priorityData = {
      critical,
      high,
      medium,
      low,

      criticalPercentage:
        priorityPercentage(critical),

      highPercentage:
        priorityPercentage(high),

      mediumPercentage:
        priorityPercentage(medium),

      lowPercentage:
        priorityPercentage(low)
    };


    // ========================================================
    // EMPLOYEE ACTIVITY
    // ========================================================

    const employees = await User
      .find({
        role: 'employee'
      })
      .lean();


    const empData = await Promise.all(

      employees.map(async (user) => {

        const employeeTickets =
          monthlyTickets.filter(ticket =>
            String(ticket.created_by) ===
            String(user._id)
          );


        const empTotal =
          employeeTickets.length;

        const empOpen =
          employeeTickets.filter(
            ticket =>
              ticket.status === 'open'
          ).length;

        const empInProgress =
          employeeTickets.filter(
            ticket =>
              ticket.status === 'in-progress'
          ).length;

        const empResolved =
          employeeTickets.filter(
            ticket =>
              ticket.status === 'resolved'
          ).length;

        const empClosed =
          employeeTickets.filter(
            ticket =>
              ticket.status === 'closed'
          ).length;


        const empCompleted =
          empResolved +
          empClosed;


        const employeeResolutionRate =
          empTotal > 0
            ? Math.round(
                (empCompleted / empTotal) * 100
              )
            : 0;


        return {

          name:
            user.name,

          department:
            user.department ?? '—',

          total:
            empTotal,

          open:
            empOpen,

          inProgress:
            empInProgress,

          resolved:
            empResolved,

          closed:
            empClosed,

          resolutionRate:
            employeeResolutionRate

        };

      })

    );


    // ========================================================
    // DEPARTMENT-WISE IT SUPPORT
    // ========================================================

    const departmentMap = {};


    // First get departments from employees
    employees.forEach(user => {

      const department =
        user.department || 'Unknown';

      if (!departmentMap[department]) {

        departmentMap[department] = {
          department,
          total: 0,
          open: 0,
          inProgress: 0,
          resolved: 0,
          closed: 0,
          pending: 0,
          resolutionRate: 0
        };

      }

    });


    // Match tickets with ticket creator
    for (const ticket of monthlyTickets) {

      const employee =
        employees.find(
          user =>
            String(user._id) ===
            String(ticket.created_by)
        );


      const department =
        employee?.department ||
        'Unknown';


      if (!departmentMap[department]) {

        departmentMap[department] = {

          department,

          total: 0,

          open: 0,

          inProgress: 0,

          resolved: 0,

          closed: 0,

          pending: 0,

          resolutionRate: 0

        };

      }


      departmentMap[department].total++;


      if (ticket.status === 'open') {
        departmentMap[department].open++;
      }


      if (ticket.status === 'in-progress') {
        departmentMap[department].inProgress++;
      }


      if (ticket.status === 'resolved') {
        departmentMap[department].resolved++;
      }


      if (ticket.status === 'closed') {
        departmentMap[department].closed++;
      }

    }


    // ========================================================
    // FINAL DEPARTMENT CALCULATION
    // ========================================================

    const departmentData =
      Object.values(
        departmentMap
      ).map(department => {

        department.pending =
          department.open +
          department.inProgress;


        const completed =
          department.resolved +
          department.closed;


        department.resolutionRate =
          department.total > 0
            ? Math.round(
                (completed /
                  department.total) *
                  100
              )
            : 0;


        return department;

      })
      .filter(
        department =>
          department.total > 0
      )
      .sort(
        (a, b) =>
          b.total - a.total
      );


    // ========================================================
    // ASSET OVERVIEW
    // ========================================================

    const [
      assetTotal,
      assetAvailable,
      assetAssigned,
      assetUnderRepair,
      assetDamaged,
      assetRetired
    ] = await Promise.all([

      Asset.countDocuments({}),

      Asset.countDocuments({
        status: 'Available'
      }),

      Asset.countDocuments({
        status: 'Assigned'
      }),

      Asset.countDocuments({
        status: 'Under Repair'
      }),

      Asset.countDocuments({
        status: 'Damaged'
      }),

      Asset.countDocuments({
        status: 'Retired'
      })

    ]);


    // ========================================================
    // WORKING ASSETS
    // ========================================================

    const assetWorking =
      Math.max(
        0,
        assetTotal -
        assetUnderRepair -
        assetDamaged -
        assetRetired
      );


    // ========================================================
    // ASSET NOT IN USE
    // ========================================================

    const assetNotInUse =
      assetAvailable;


    // ========================================================
    // ASSET CATEGORY DATA
    // ========================================================

    const allAssets =
      await Asset
        .find({})
        .lean();


    // --------------------------------------------------------
    // CATEGORY NORMALIZER
    // --------------------------------------------------------

    const normalizeCategory = (value) => {

      return String(value || '')
        .trim()
        .toLowerCase();

    };


    // --------------------------------------------------------
    // LAPTOP
    // --------------------------------------------------------

    const laptopCount =
      allAssets.filter(asset =>
        normalizeCategory(asset.category)
          .includes('laptop')
      ).length;


    // --------------------------------------------------------
    // CPU
    //
    // Your system uses CPU category for desktop systems.
    // --------------------------------------------------------

    const cpuCount =
      allAssets.filter(asset =>
        normalizeCategory(asset.category)
          .includes('cpu')
      ).length;


    // --------------------------------------------------------
    // MONITOR
    // --------------------------------------------------------

    const monitorCount =
      allAssets.filter(asset =>
        normalizeCategory(asset.category)
          .includes('monitor')
      ).length;


    // --------------------------------------------------------
    // PRINTER
    // --------------------------------------------------------

    const printerCount =
      allAssets.filter(asset =>
        normalizeCategory(asset.category)
          .includes('printer')
      ).length;


    // --------------------------------------------------------
    // ACCESSORIES
    //
    // Anything other than:
    // Laptop / CPU / Monitor / Printer
    // --------------------------------------------------------

    const accessoriesCount =
      allAssets.filter(asset => {

        const category =
          normalizeCategory(
            asset.category
          );


        return (
          !category.includes('laptop') &&
          !category.includes('cpu') &&
          !category.includes('monitor') &&
          !category.includes('printer')
        );

      }).length;


    // ========================================================
    // ASSET DATA
    // ========================================================

    const assetData = {

      total:
        assetTotal,

      assigned:
        assetAssigned,

      available:
        assetAvailable,

      working:
        assetWorking,

      notInUse:
        assetNotInUse,

      underRepair:
        assetUnderRepair,

      damaged:
        assetDamaged,

      retired:
        assetRetired,

      laptops:
        laptopCount,

      // IMPORTANT:
      // Frontend variable can still be asset.desktops
      // but value comes from CPU category.
      desktops:
        cpuCount,

      monitors:
        monitorCount,

      printers:
        printerCount,

      accessories:
        accessoriesCount

    };


    // ========================================================
    // FINAL RESPONSE
    // ========================================================

    res.json({

      // ======================================================
      // TICKET DATA
      // ======================================================

      tkt: {

        total,

        open_c,

        open:
          open_c,

        inprog,

        resolved,

        closed,

        pending,

        completed,

        resolutionRate,

        resolvedOnlyRate,

        closureRate,

        // SLA fields
        // We can calculate these later using SLA rules.
        slaCompliance: 0,

        slaBreached: 0,

        avgResolutionTime: 0

      },


      // ======================================================
      // PRIORITY DATA
      // ======================================================

      priorityData,


      // ======================================================
      // DEPARTMENT DATA
      // ======================================================

      departmentData,


      // ======================================================
      // EMPLOYEE DATA
      // ======================================================

      empData:
        empData.sort(
          (a, b) =>
            b.total - a.total
        ),


      // ======================================================
      // ASSET DATA
      // ======================================================

      assetData

    });

  } catch (err) {

    console.error(
      'Reports error:',
      err
    );

    res.status(500).json({
      error: err.message
    });

  }

});


module.exports = router;
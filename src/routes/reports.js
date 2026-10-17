const router = require('express').Router();

const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Asset = require('../models/Asset');

// Optional model: report still works if you don't have it
let Feedback = null;
try {
  Feedback = require('../models/Feedback');
} catch (e) {
  Feedback = null;
}

// ============================================================
// CONFIG
// ============================================================

// SLA target (hours) per priority. Change to match your policy.
const SLA_HOURS = { critical: 4, high: 8, medium: 24, low: 48 };
const DEFAULT_SLA_HOURS = 24;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const TREND_MONTHS = 6;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ============================================================
// HELPERS
// ============================================================

const pct = (value, total) => (total > 0 ? Math.round((value / total) * 100) : 0);
const round1 = (n) => Math.round(n * 10) / 10;
const idOf = (v) => String((v && v._id) || v || '');

const slaLimit = (t) => SLA_HOURS[String(t.priority || '').toLowerCase()] || DEFAULT_SLA_HOURS;

// When was the ticket completed? (null if still open)
// Uses resolved/closed timestamp fields if you have them, else updatedAt.
const doneAt = (t) => {
  if (t.status !== 'resolved' && t.status !== 'closed') return null;
  return t.resolvedAt || t.resolved_at || t.closedAt || t.closed_at || t.updatedAt || null;
};

const ticketNo = (t) =>
  t.ticket_no || t.ticketNo || t.ticket_id || t.ticketId || `#${String(t._id).slice(-6).toUpperCase()}`;

const ticketTitle = (t) => t.title || t.subject || 'Untitled';

const assigneeOf = (t) => idOf(t.assigned_to || t.assignedTo || t.assignee);

// Stats used for BOTH the selected month and the previous month
function summarize(tickets, nowMs) {
  const count = (s) => tickets.filter((t) => t.status === s).length;

  const total = tickets.length;
  const open_c = count('open');
  const inprog = count('in-progress');
  const resolved = count('resolved');
  const closed = count('closed');
  const pending = open_c + inprog;
  const completed = resolved + closed;

  const durations = [];
  const breached = [];
  let withinSla = 0;

  for (const t of tickets) {
    const created = new Date(t.createdAt).getTime();
    const done = doneAt(t);
    const endMs = done ? new Date(done).getTime() : nowMs;
    const hours = (endMs - created) / HOUR;
    const limit = slaLimit(t);

    if (done) durations.push(hours);

    if (hours > limit) {
      breached.push({ ticket: t, hoursOver: round1(hours - limit) });
    } else {
      withinSla++;
    }
  }

  const avgResolutionTime = durations.length
    ? round1(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  return {
    total,
    open_c,
    inprog,
    resolved,
    closed,
    pending,
    completed,
    resolutionRate: pct(completed, total),
    resolvedOnlyRate: pct(resolved, total),
    closureRate: pct(closed, total),
    slaCompliance: total ? pct(withinSla, total) : 0,
    slaBreached: breached.length,
    avgResolutionTime,
    breached,
  };
}

// ============================================================
// MONTHLY REPORT
// GET /reports?year=2026&month=10
// ============================================================

router.get('/', async (req, res) => {
  try {
    const { year, month } = req.query;

    // ---------- validation ----------
    if (!year || !month) {
      return res.status(400).json({ error: 'year and month are required' });
    }

    const selectedYear = Number(year);
    const selectedMonth = Number(month);

    if (
      Number.isNaN(selectedYear) ||
      Number.isNaN(selectedMonth) ||
      selectedMonth < 1 ||
      selectedMonth > 12
    ) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    // ---------- date ranges ----------
    const now = new Date();
    const nowMs = now.getTime();

    const start = new Date(selectedYear, selectedMonth - 1, 1);
    const end = new Date(selectedYear, selectedMonth, 1);
    const prevStart = new Date(selectedYear, selectedMonth - 2, 1);
    const trendStart = new Date(selectedYear, selectedMonth - TREND_MONTHS, 1);

    // ---------- one query covers month + previous month + trend ----------
    const rangeTickets = await Ticket.find({
      createdAt: { $gte: trendStart, $lt: end },
    }).lean();

    const monthlyTickets = rangeTickets.filter((t) => new Date(t.createdAt) >= start);
    const prevTickets = rangeTickets.filter((t) => {
      const c = new Date(t.createdAt);
      return c >= prevStart && c < start;
    });

    // ---------- main summary ----------
    const stats = summarize(monthlyTickets, nowMs);
    const prevStats = summarize(prevTickets, nowMs);
    const total = stats.total;

    const tkt = {
      total: stats.total,
      open_c: stats.open_c,
      open: stats.open_c,
      inprog: stats.inprog,
      resolved: stats.resolved,
      closed: stats.closed,
      pending: stats.pending,
      completed: stats.completed,
      resolutionRate: stats.resolutionRate,
      resolvedOnlyRate: stats.resolvedOnlyRate,
      closureRate: stats.closureRate,
      slaCompliance: stats.slaCompliance,
      slaBreached: stats.slaBreached,
      avgResolutionTime: stats.avgResolutionTime,
    };

    const prevMonth = {
      total: prevStats.total,
      resolved: prevStats.resolved,
      closed: prevStats.closed,
      pending: prevStats.pending,
      slaCompliance: prevStats.slaCompliance,
      avgResolutionTime: prevStats.avgResolutionTime,
    };

    // ---------- priority ----------
    const countPriority = (p) => monthlyTickets.filter((t) => t.priority === p).length;
    const critical = countPriority('critical');
    const high = countPriority('high');
    const medium = countPriority('medium');
    const low = countPriority('low');

    const priorityData = {
      critical,
      high,
      medium,
      low,
      criticalPercentage: pct(critical, total),
      highPercentage: pct(high, total),
      mediumPercentage: pct(medium, total),
      lowPercentage: pct(low, total),
    };

    // ---------- employees (ticket raisers) ----------
    const employees = await User.find({ role: 'employee' }).lean();
    const employeeById = new Map(employees.map((u) => [String(u._id), u]));

    const empData = employees
      .map((user) => {
        const mine = monthlyTickets.filter((t) => idOf(t.created_by) === String(user._id));
        const count = (s) => mine.filter((t) => t.status === s).length;

        const empResolved = count('resolved');
        const empClosed = count('closed');

        return {
          name: user.name,
          department: user.department ?? '—',
          total: mine.length,
          open: count('open'),
          inProgress: count('in-progress'),
          resolved: empResolved,
          closed: empClosed,
          resolutionRate: pct(empResolved + empClosed, mine.length),
        };
      })
      .sort((a, b) => b.total - a.total);

    // ---------- department ----------
    const departmentMap = {};
    const blankDept = (department) => ({
      department,
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      pending: 0,
      resolutionRate: 0,
    });

    for (const t of monthlyTickets) {
      const creator = employeeById.get(idOf(t.created_by));
      const department = creator?.department || 'Unknown';

      if (!departmentMap[department]) departmentMap[department] = blankDept(department);
      const d = departmentMap[department];

      d.total++;
      if (t.status === 'open') d.open++;
      if (t.status === 'in-progress') d.inProgress++;
      if (t.status === 'resolved') d.resolved++;
      if (t.status === 'closed') d.closed++;
    }

    const departmentData = Object.values(departmentMap)
      .map((d) => {
        d.pending = d.open + d.inProgress;
        d.resolutionRate = pct(d.resolved + d.closed, d.total);
        return d;
      })
      .sort((a, b) => b.total - a.total);

    // ---------- monthly trend (last 6 months) ----------
    const monthlyTrend = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const d = new Date(selectedYear, selectedMonth - 1 - i, 1);
      const bucketStart = d;
      const bucketEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      const bucket = rangeTickets.filter((t) => {
        const c = new Date(t.createdAt);
        return c >= bucketStart && c < bucketEnd;
      });

      monthlyTrend.push({
        month: MONTH_NAMES[d.getMonth()],
        total: bucket.length,
        resolved: bucket.filter((t) => t.status === 'resolved').length,
        closed: bucket.filter((t) => t.status === 'closed').length,
      });
    }

    // ---------- category ----------
    const categoryMap = {};
    for (const t of monthlyTickets) {
      const c = String(t.category || t.type || 'Other').trim() || 'Other';
      categoryMap[c] = (categoryMap[c] || 0) + 1;
    }
    const categoryData = Object.entries(categoryMap)
      .map(([category, count]) => ({ category, total: count }))
      .sort((a, b) => b.total - a.total);

    // ---------- IT staff performance (tickets handled) ----------
    const staffMap = {};
    for (const t of monthlyTickets) {
      const staffId = assigneeOf(t);
      if (!staffId) continue;

      if (!staffMap[staffId]) staffMap[staffId] = { assigned: 0, resolved: 0, durations: [] };
      const s = staffMap[staffId];

      s.assigned++;
      const done = doneAt(t);
      if (done) {
        s.resolved++;
        s.durations.push((new Date(done).getTime() - new Date(t.createdAt).getTime()) / HOUR);
      }
    }

    const staffIds = Object.keys(staffMap);
    const staffUsers = staffIds.length ? await User.find({ _id: { $in: staffIds } }).lean() : [];
    const staffNameById = new Map(staffUsers.map((u) => [String(u._id), u.name]));

    const staffData = staffIds
      .map((id) => {
        const s = staffMap[id];
        return {
          name: staffNameById.get(id) || 'Unknown',
          assigned: s.assigned,
          resolved: s.resolved,
          avgResolutionTime: s.durations.length
            ? round1(s.durations.reduce((a, b) => a + b, 0) / s.durations.length)
            : 0,
        };
      })
      .sort((a, b) => b.resolved - a.resolved);

    // ---------- SLA breached tickets (worst 20) ----------
    const breachedSorted = [...stats.breached].sort((a, b) => b.hoursOver - a.hoursOver).slice(0, 20);

    const slaBreachedTickets = breachedSorted.map(({ ticket: t, hoursOver }) => ({
      ticketNo: ticketNo(t),
      title: ticketTitle(t),
      department: employeeById.get(idOf(t.created_by))?.department || '—',
      assignedTo: staffNameById.get(assigneeOf(t)) || '—',
      hoursOver,
    }));

    // ---------- aging: ALL currently open tickets (not month-filtered) ----------
    const openNow = await Ticket.find({ status: { $in: ['open', 'in-progress'] } })
      .select('createdAt')
      .lean();

    const ageDays = (t) => (nowMs - new Date(t.createdAt).getTime()) / DAY;
    const aging = {
      gt3d: openNow.filter((t) => ageDays(t) > 3).length,
      gt7d: openNow.filter((t) => ageDays(t) > 7).length,
      gt14d: openNow.filter((t) => ageDays(t) > 14).length,
    };

    // ---------- feedback (optional) ----------
    let feedback;
    if (Feedback) {
      try {
        const list = await Feedback.find({ createdAt: { $gte: start, $lt: end } })
          .select('rating')
          .lean();
        const rated = list.filter((f) => Number(f.rating) > 0);
        if (rated.length) {
          feedback = {
            avgRating: round1(rated.reduce((a, f) => a + Number(f.rating), 0) / rated.length),
            count: rated.length,
          };
        }
      } catch (e) {
        feedback = undefined;
      }
    }

    // ---------- assets ----------
    const allAssets = await Asset.find({}).lean();
    const countStatus = (s) => allAssets.filter((a) => a.status === s).length;

    const assetTotal = allAssets.length;
    const assetAvailable = countStatus('Available');
    const assetAssigned = countStatus('Assigned');
    const assetUnderRepair = countStatus('Under Repair');
    const assetDamaged = countStatus('Damaged');
    const assetRetired = countStatus('Retired');

    const assetWorking = Math.max(0, assetTotal - assetUnderRepair - assetDamaged - assetRetired);

    const cat = (a) => String(a.category || '').trim().toLowerCase();
    const has = (a, word) => cat(a).includes(word);

    const assetData = {
      total: assetTotal,
      assigned: assetAssigned,
      available: assetAvailable,
      working: assetWorking,
      notInUse: assetAvailable,
      underRepair: assetUnderRepair,
      damaged: assetDamaged,
      retired: assetRetired,
      laptops: allAssets.filter((a) => has(a, 'laptop')).length,
      desktops: allAssets.filter((a) => has(a, 'cpu')).length, // CPU category = desktops
      monitors: allAssets.filter((a) => has(a, 'monitor')).length,
      printers: allAssets.filter((a) => has(a, 'printer')).length,
      accessories: allAssets.filter(
        (a) => !has(a, 'laptop') && !has(a, 'cpu') && !has(a, 'monitor') && !has(a, 'printer')
      ).length,
    };

    // Warranty / idle / old assets (field names guessed, see notes)
    const warrantyEnd = (a) => a.warranty_expiry || a.warrantyExpiry || a.warranty_end || a.warrantyEnd;
    const purchasedOn = (a) => a.purchase_date || a.purchaseDate;

    const assetExtra = {
      warrantyExpiring: allAssets.filter((a) => {
        const w = warrantyEnd(a);
        if (!w) return false;
        const diff = new Date(w).getTime() - nowMs;
        return diff >= 0 && diff <= 90 * DAY;
      }).length,

      idle: allAssets.filter(
        (a) => a.status === 'Available' && a.updatedAt && nowMs - new Date(a.updatedAt).getTime() > 90 * DAY
      ).length,

      oldAssets: allAssets.filter((a) => {
        const p = purchasedOn(a);
        return p && nowMs - new Date(p).getTime() > 3 * 365 * DAY;
      }).length,
    };

    // ---------- response ----------
    res.json({
      tkt,
      prevMonth,
      priorityData,
      departmentData,
      empData,
      staffData,
      monthlyTrend,
      categoryData,
      slaBreachedTickets,
      aging,
      feedback,
      assetData,
      assetExtra,
    });
  } catch (err) {
    console.error('Reports error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
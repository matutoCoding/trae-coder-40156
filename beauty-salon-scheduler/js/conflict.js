var Conflict = (function () {

    function timeOverlaps(start1, end1, start2, end2) {
        return start1 < end2 && start2 < end1;
    }

    function checkOverlap(bedId, date, startTime, endTime, excludeId) {
        var appointments = Store.query('appointments', function (a) {
            if (a.bedId !== bedId) return false;
            if (a.date !== date) return false;
            if (a.status !== 'booked') return false;
            if (excludeId && a.id === excludeId) return false;
            return timeOverlaps(startTime, endTime, a.startTime, a.endTime);
        });
        return appointments.length > 0 ? appointments : null;
    }

    function checkAllConflicts(date) {
        var appointments = Store.query('appointments', function (a) {
            return a.date === date && a.status === 'booked';
        });

        var conflicts = [];
        for (var i = 0; i < appointments.length; i++) {
            for (var j = i + 1; j < appointments.length; j++) {
                var a = appointments[i];
                var b = appointments[j];
                if (a.bedId === b.bedId && timeOverlaps(a.startTime, a.endTime, b.startTime, b.endTime)) {
                    conflicts.push({
                        type: 'bed_overlap',
                        appointment1: a,
                        appointment2: b,
                        bedId: a.bedId,
                        message: '美容床时段重叠'
                    });
                }
            }
        }
        return conflicts;
    }

    function detectConflicts() {
        var allDates = [];
        var appointments = Store.getAll('appointments');
        appointments.forEach(function (a) {
            if (a.status === 'booked' && allDates.indexOf(a.date) === -1) {
                allDates.push(a.date);
            }
        });

        var allConflicts = [];
        allDates.forEach(function (date) {
            var dateConflicts = checkAllConflicts(date);
            allConflicts = allConflicts.concat(dateConflicts);
        });

        Store.replaceAll('conflicts', allConflicts.map(function (c) {
            c.id = c.appointment1.id + '_' + c.appointment2.id;
            c.detectedAt = new Date().toISOString();
            return c;
        }));

        return allConflicts;
    }

    function releaseSlot(appointmentId) {
        var appt = Store.getById('appointments', appointmentId);
        if (!appt) return null;

        if (appt.status === 'cancelled') {
            App.showToast('该预约已经取消，时段已释放', 'warning');
            return null;
        }

        return Scheduler.cancelAppointment(appointmentId);
    }

    function getReleasedSlots() {
        return Store.getAll('releasedSlots');
    }

    function getBedOccupancy(bedId, date) {
        var appts = Store.query('appointments', function (a) {
            return a.bedId === bedId && a.date === date && a.status === 'booked';
        });

        var totalSlots = 25;
        var occupiedSlots = 0;
        appts.forEach(function (a) {
            occupiedSlots += Math.round((a.endTime - a.startTime) * 2);
        });

        return {
            total: totalSlots,
            occupied: occupiedSlots,
            free: totalSlots - occupiedSlots,
            rate: Math.round((occupiedSlots / totalSlots) * 100)
        };
    }

    function renderConflictTimeline(date) {
        var container = document.getElementById('conflict-timeline');
        if (!container) return;

        var beds = Store.getAll('beds');
        if (beds.length === 0) {
            container.innerHTML = '<div class="timeline-placeholder">暂无美容床数据</div>';
            return;
        }

        var TIME_SLOTS = Scheduler.getTimeSlots();
        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');

        var html = '<div class="conflict-timeline-header">' +
            '<div class="conflict-timeline-corner">美容床</div>';

        TIME_SLOTS.forEach(function (slot) {
            html += '<div class="conflict-timeline-cell">' + slot.label.replace(':00', '').replace(':30', '½') + '</div>';
        });
        html += '</div>';

        beds.forEach(function (bed) {
            var appts = Store.query('appointments', function (a) {
                return a.bedId === bed.id && a.date === date && a.status === 'booked';
            });
            var occupancy = getBedOccupancy(bed.id, date);

            html += '<div class="conflict-timeline-row">' +
                '<div class="conflict-timeline-label">' +
                '<strong>' + bed.name + '</strong>' +
                '<span class="occupancy-badge ' + (occupancy.rate > 80 ? 'high' : occupancy.rate > 50 ? 'medium' : 'low') + '">' +
                occupancy.rate + '%</span>' +
                '</div>' +
                '<div class="conflict-timeline-bars">';

            var barSegments = [];
            appts.sort(function (a, b) { return a.startTime - b.startTime; });

            var prevEnd = 9;
            appts.forEach(function (appt) {
                if (appt.startTime > prevEnd) {
                    var freeLeft = ((prevEnd - 9) / 12) * 100;
                    var freeWidth = ((appt.startTime - prevEnd) / 12) * 100;
                    barSegments.push('<div class="bar-segment free" style="left:' + freeLeft + '%;width:' + freeWidth + '%" title="空闲"></div>');
                }

                var customer = customers.find(function (c) { return c.id === appt.customerId; });
                var beautician = beauticians.find(function (b) { return b.id === appt.beauticianId; });
                var occLeft = ((appt.startTime - 9) / 12) * 100;
                var occWidth = ((appt.endTime - appt.startTime) / 12) * 100;
                barSegments.push('<div class="bar-segment occupied" style="left:' + occLeft + '%;width:' + occWidth + '%" ' +
                    'title="' + (customer ? customer.name : '') + ' ' + Scheduler.formatTime(appt.startTime) + '-' + Scheduler.formatTime(appt.endTime) + '">' +
                    '<span>' + (customer ? customer.name : '') + '</span></div>');
                prevEnd = appt.endTime;
            });

            if (prevEnd < 21) {
                var lastFreeLeft = ((prevEnd - 9) / 12) * 100;
                var lastFreeWidth = ((21 - prevEnd) / 12) * 100;
                barSegments.push('<div class="bar-segment free" style="left:' + lastFreeLeft + '%;width:' + lastFreeWidth + '%" title="空闲"></div>');
            }

            html += barSegments.join('');
            html += '</div></div>';
        });

        container.innerHTML = html;
    }

    function renderConflictList(date) {
        var container = document.getElementById('conflict-list');
        if (!container) return;

        var conflicts = checkAllConflicts(date);
        var customers = Store.getAll('customers');
        var beds = Store.getAll('beds');

        if (conflicts.length === 0) {
            container.innerHTML = '<div class="empty-hint success-hint">✅ 未检测到时段冲突</div>';
            return;
        }

        container.innerHTML = conflicts.map(function (c, idx) {
            var bed = beds.find(function (b) { return b.id === c.bedId; });
            var c1 = customers.find(function (cu) { return cu.id === c.appointment1.customerId; });
            var c2 = customers.find(function (cu) { return cu.id === c.appointment2.customerId; });

            return '<div class="list-item conflict-item">' +
                '<div class="conflict-badge">冲突 #' + (idx + 1) + '</div>' +
                '<div class="conflict-detail">' +
                '<p>美容床: <strong>' + (bed ? bed.name : '未知') + '</strong></p>' +
                '<p>预约1: ' + (c1 ? c1.name : '未知') + ' ' + Scheduler.formatTime(c.appointment1.startTime) + '-' + Scheduler.formatTime(c.appointment1.endTime) + '</p>' +
                '<p>预约2: ' + (c2 ? c2.name : '未知') + ' ' + Scheduler.formatTime(c.appointment2.startTime) + '-' + Scheduler.formatTime(c.appointment2.endTime) + '</p>' +
                '</div>' +
                '<div class="item-actions">' +
                '<button class="btn btn-sm btn-warning" data-action="resolve-cancel" data-id="' + c.appointment2.id + '">取消预约2</button>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function renderReleasedList() {
        var container = document.getElementById('released-list');
        if (!container) return;

        var released = getReleasedSlots();
        var beds = Store.getAll('beds');

        if (released.length === 0) {
            container.innerHTML = '<div class="empty-hint">暂无已释放时段</div>';
            return;
        }

        container.innerHTML = released.slice().reverse().map(function (r) {
            var bed = beds.find(function (b) { return b.id === r.bedId; });
            var releasedTime = new Date(r.releasedAt);
            return '<div class="list-item released-item">' +
                '<div class="item-main">' +
                '<span class="released-badge">已释放</span>' +
                '<div class="item-info">' +
                '<strong>' + (bed ? bed.name : '未知') + '</strong>' +
                '<small>' + r.date + ' ' + Scheduler.formatTime(r.startTime) + '-' + Scheduler.formatTime(r.endTime) + '</small>' +
                '<small class="released-time">释放于 ' + releasedTime.toLocaleString('zh-CN') + '</small>' +
                '</div>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function refresh(date) {
        renderConflictTimeline(date);
        renderConflictList(date);
        renderReleasedList();
    }

    return {
        timeOverlaps: timeOverlaps,
        checkOverlap: checkOverlap,
        checkAllConflicts: checkAllConflicts,
        detectConflicts: detectConflicts,
        releaseSlot: releaseSlot,
        getReleasedSlots: getReleasedSlots,
        getBedOccupancy: getBedOccupancy,
        renderConflictTimeline: renderConflictTimeline,
        renderConflictList: renderConflictList,
        renderReleasedList: renderReleasedList,
        refresh: refresh
    };
})();

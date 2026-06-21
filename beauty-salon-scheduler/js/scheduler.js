var Scheduler = (function () {
    var TIME_SLOTS = [];
    for (var h = 9; h <= 21; h++) {
        TIME_SLOTS.push({ hour: h, label: (h < 10 ? '0' : '') + h + ':00' });
        TIME_SLOTS.push({ hour: h + 0.5, label: (h < 10 ? '0' : '') + h + ':30' });
    }

    var currentView = 'day';
    var filters = {
        beauticianId: '',
        serviceType: '',
        bedId: ''
    };

    var SERVICE_TYPES = [
        { id: 'facial_basic', name: '基础面部护理', duration: 60 },
        { id: 'facial_deep', name: '深层清洁护理', duration: 90 },
        { id: 'facial_antiaging', name: '抗衰老护理', duration: 90 },
        { id: 'facial_whitening', name: '美白护理', duration: 75 },
        { id: 'body_relax', name: '全身放松SPA', duration: 120 },
        { id: 'body_slim', name: '纤体塑形', duration: 90 },
        { id: 'skin_hydrate', name: '深层补水', duration: 60 },
        { id: 'skin_repair', name: '敏感肌修复', duration: 75 },
        { id: 'eye_care', name: '眼部护理', duration: 45 },
        { id: 'neck_care', name: '颈部护理', duration: 45 }
    ];

    function getTimeSlots() {
        return TIME_SLOTS;
    }

    function getServiceTypes() {
        return SERVICE_TYPES;
    }

    function addBed(name, location, equipment) {
        var existing = Store.query('beds', function (b) { return b.name === name; });
        if (existing.length > 0) {
            App.showToast('美容床名称已存在', 'error');
            return null;
        }
        return Store.add('beds', {
            name: name,
            location: location || '',
            equipment: equipment || '',
            status: 'active'
        });
    }

    function updateBed(id, updates) {
        return Store.update('beds', id, updates);
    }

    function deleteBed(id) {
        var appts = Store.query('appointments', function (a) {
            return a.bedId === id && a.status === 'booked';
        });
        if (appts.length > 0) {
            App.showToast('该美容床仍有有效预约，无法删除', 'error');
            return false;
        }
        Store.remove('beds', id);
        return true;
    }

    function addCustomer(name, phone, skinType, notes) {
        var existing = Store.query('customers', function (c) { return c.phone === phone; });
        if (existing.length > 0) {
            App.showToast('该手机号已登记', 'error');
            return null;
        }
        return Store.add('customers', {
            name: name,
            phone: phone,
            skinType: skinType || 'unknown',
            notes: notes || '',
            visitCount: 0
        });
    }

    function updateCustomer(id, updates) {
        return Store.update('customers', id, updates);
    }

    function deleteCustomer(id) {
        Store.remove('customers', id);
        return true;
    }

    function addBeautician(name, phone, specialties, expertise) {
        return Store.add('beauticians', {
            name: name,
            phone: phone || '',
            specialties: specialties || [],
            expertise: expertise || [],
            status: 'active'
        });
    }

    function updateBeautician(id, updates) {
        return Store.update('beauticians', id, updates);
    }

    function deleteBeautician(id) {
        var appts = Store.query('appointments', function (a) {
            return a.beauticianId === id && a.status === 'booked';
        });
        if (appts.length > 0) {
            App.showToast('该美容师仍有有效预约，无法删除', 'error');
            return false;
        }
        Store.remove('beauticians', id);
        return true;
    }

    function createAppointment(data) {
        var conflict = Conflict.checkOverlap(data.bedId, data.date, data.startTime, data.endTime);
        if (conflict) {
            App.showToast('时段冲突：该美容床在此时段已有预约', 'error');
            return null;
        }

        var service = SERVICE_TYPES.find(function (s) { return s.id === data.serviceType; });
        return Store.add('appointments', {
            customerId: data.customerId,
            beauticianId: data.beauticianId,
            bedId: data.bedId,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            serviceType: data.serviceType,
            serviceName: service ? service.name : data.serviceType,
            status: 'booked',
            notes: data.notes || ''
        });
    }

    function cancelAppointment(id) {
        var appt = Store.getById('appointments', id);
        if (!appt) return null;
        if (appt.status !== 'booked') {
            App.showToast('该预约已取消', 'warning');
            return null;
        }

        Store.update('appointments', id, { status: 'cancelled' });

        Store.add('releasedSlots', {
            appointmentId: id,
            bedId: appt.bedId,
            date: appt.date,
            startTime: appt.startTime,
            endTime: appt.endTime,
            releasedAt: new Date().toISOString()
        });

        App.showToast('预约已取消，时段已释放', 'success');
        return Store.getById('appointments', id);
    }

    function getAppointmentsByDate(date) {
        return Store.query('appointments', function (a) { return a.date === date; });
    }

    function getBookedAppointmentsByDate(date) {
        return Store.query('appointments', function (a) {
            return a.date === date && a.status === 'booked';
        });
    }

    function getBedSchedule(bedId, date) {
        return Store.query('appointments', function (a) {
            return a.bedId === bedId && a.date === date && a.status === 'booked';
        });
    }

    function renderBedList() {
        var beds = Store.getAll('beds');
        var container = document.getElementById('bed-list');
        if (!container) return;

        if (beds.length === 0) {
            container.innerHTML = '<div class="empty-hint">暂无美容床，请点击"美容床建档"添加</div>';
            return;
        }

        container.innerHTML = beds.map(function (bed) {
            return '<div class="list-item bed-item" data-id="' + bed.id + '">' +
                '<div class="item-main">' +
                '<span class="item-icon">🛏️</span>' +
                '<div class="item-info">' +
                '<strong>' + bed.name + '</strong>' +
                '<small>' + (bed.location || '未指定位置') + '</small>' +
                '</div>' +
                '</div>' +
                '<div class="item-actions">' +
                '<button class="btn-icon btn-edit" data-action="edit-bed" data-id="' + bed.id + '" title="编辑">✏️</button>' +
                '<button class="btn-icon btn-delete" data-action="delete-bed" data-id="' + bed.id + '" title="删除">🗑️</button>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function renderTodayAppointments(date) {
        var appts = getBookedAppointmentsByDate(date);
        var container = document.getElementById('today-appointments');
        if (!container) return;

        if (appts.length === 0) {
            container.innerHTML = '<div class="empty-hint">今日暂无预约</div>';
            return;
        }

        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');

        container.innerHTML = appts.sort(function (a, b) {
            return a.startTime - b.startTime;
        }).map(function (appt) {
            var customer = customers.find(function (c) { return c.id === appt.customerId; });
            var beautician = beauticians.find(function (b) { return b.id === appt.beauticianId; });
            var startStr = formatTime(appt.startTime);
            var endStr = formatTime(appt.endTime);

            return '<div class="list-item appointment-item" data-id="' + appt.id + '">' +
                '<div class="item-main">' +
                '<span class="time-badge">' + startStr + '-' + endStr + '</span>' +
                '<div class="item-info">' +
                '<strong>' + (customer ? customer.name : '未知顾客') + '</strong>' +
                '<small>' + appt.serviceName + ' · ' + (beautician ? beautician.name : '未知美容师') + '</small>' +
                '</div>' +
                '</div>' +
                '<div class="item-actions">' +
                '<button class="btn-icon btn-cancel" data-action="cancel-appointment" data-id="' + appt.id + '" title="取消预约">❌</button>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function renderFilterBar() {
        var container = document.getElementById('schedule-timeline');
        if (!container) return;

        var beauticians = Store.getAll('beauticians');
        var beds = Store.getAll('beds');

        var beauticianOptions = '<option value="">全部美容师</option>' +
            beauticians.map(function (b) {
                var sel = filters.beauticianId === b.id ? 'selected' : '';
                return '<option value="' + b.id + '" ' + sel + '>' + b.name + '</option>';
            }).join('');

        var serviceOptions = '<option value="">全部项目</option>' +
            SERVICE_TYPES.map(function (s) {
                var sel = filters.serviceType === s.id ? 'selected' : '';
                return '<option value="' + s.id + '" ' + sel + '>' + s.name + '</option>';
            }).join('');

        var bedOptions = '<option value="">全部美容床</option>' +
            beds.map(function (b) {
                var sel = filters.bedId === b.id ? 'selected' : '';
                return '<option value="' + b.id + '" ' + sel + '>' + b.name + '</option>';
            }).join('');

        var viewDayClass = currentView === 'day' ? 'active' : '';
        var viewWeekClass = currentView === 'week' ? 'active' : '';

        var html = '<div class="filter-bar">' +
            '<div class="filter-group">' +
            '<label class="filter-label">美容师:</label>' +
            '<select class="filter-select" id="filter-beautician">' + beauticianOptions + '</select>' +
            '</div>' +
            '<div class="filter-group">' +
            '<label class="filter-label">项目:</label>' +
            '<select class="filter-select" id="filter-service">' + serviceOptions + '</select>' +
            '</div>' +
            '<div class="filter-group">' +
            '<label class="filter-label">美容床:</label>' +
            '<select class="filter-select" id="filter-bed">' + bedOptions + '</select>' +
            '</div>' +
            '<div class="view-toggle">' +
            '<button class="view-toggle-btn ' + viewDayClass + '" data-view="day">日视图</button>' +
            '<button class="view-toggle-btn ' + viewWeekClass + '" data-view="week">周视图</button>' +
            '</div>' +
            '</div>';

        return html;
    }

    function matchFilter(appt) {
        if (filters.beauticianId && appt.beauticianId !== filters.beauticianId) return false;
        if (filters.serviceType && appt.serviceType !== filters.serviceType) return false;
        if (filters.bedId && appt.bedId !== filters.bedId) return false;
        return true;
    }

    function renderTimeline(date) {
        var container = document.getElementById('schedule-timeline');
        if (!container) return;

        var html = renderFilterBar();

        if (currentView === 'day') {
            html += renderDayView(date);
        } else {
            html += renderWeekView(date);
        }

        container.innerHTML = html;
        bindFilterEvents();
        bindViewToggleEvents();
    }

    function renderDayView(date) {
        var beds = Store.getAll('beds');
        if (beds.length === 0) {
            return '<div class="timeline-placeholder">请先添加美容床</div>';
        }

        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');
        var releasedSlots = Store.getAll('releasedSlots').filter(function (s) {
            return s.date === date;
        });

        var html = '<div class="tl-table">';

        html += '<div class="tl-header-row"><div class="tl-bed-label"></div>';
        TIME_SLOTS.forEach(function (slot) {
            html += '<div class="tl-time-cell">' + slot.label + '</div>';
        });
        html += '</div>';

        beds.forEach(function (bed) {
            var appts = getBedSchedule(bed.id, date);
            html += '<div class="tl-bed-row">';
            html += '<div class="tl-bed-label">' + bed.name + '</div>';
            html += '<div class="tl-slots-container">';

            releasedSlots.filter(function (s) { return s.bedId === bed.id; }).forEach(function (slot) {
                var leftPct = ((slot.startTime - 9) / 12) * 100;
                var widthPct = ((slot.endTime - slot.startTime) / 12) * 100;
                var isRecent = (new Date() - new Date(slot.releasedAt)) < 10000;
                var highlightClass = isRecent ? 'slot-highlight' : '';
                html += '<div class="tl-free-slot ' + highlightClass + '" style="left:' + leftPct + '%;width:' + widthPct + '%">' +
                    '<span class="free-label">可预约</span>' +
                    '</div>';
            });

            appts.forEach(function (appt) {
                var customer = customers.find(function (c) { return c.id === appt.customerId; });
                var leftPct = ((appt.startTime - 9) / 12) * 100;
                var widthPct = ((appt.endTime - appt.startTime) / 12) * 100;
                var filterClass = matchFilter(appt) ? 'filtered-in' : 'filtered-out';
                html += '<div class="tl-appt-bar ' + filterClass + '" style="left:' + leftPct + '%;width:' + widthPct + '%" ' +
                    'data-action="view-appointment" data-id="' + appt.id + '" ' +
                    'title="' + (customer ? customer.name : '') + ' ' + appt.serviceName + '">' +
                    '<span class="bar-name">' + (customer ? customer.name : '') + '</span>' +
                    '<span class="bar-service">' + appt.serviceName + '</span>' +
                    '</div>';
            });

            html += '</div>';
            html += '</div>';
        });

        html += '</div>';
        return html;
    }

    function renderWeekView(date) {
        var beds = Store.getAll('beds');
        if (beds.length === 0) {
            return '<div class="timeline-placeholder">请先添加美容床</div>';
        }

        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');
        var baseDate = new Date(date + 'T00:00:00');
        var dayOfWeek = baseDate.getDay() || 7;
        var mondayOffset = dayOfWeek - 1;
        baseDate.setDate(baseDate.getDate() - mondayOffset);

        var weekDates = [];
        for (var i = 0; i < 7; i++) {
            var d = new Date(baseDate);
            d.setDate(d.getDate() + i);
            var dateStr = d.toISOString().split('T')[0];
            weekDates.push({
                date: dateStr,
                label: (d.getMonth() + 1) + '/' + d.getDate(),
                weekday: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][i]
            });
        }

        var html = '<div class="week-view">';
        html += '<div class="week-header">';
        html += '<div class="week-corner"></div>';
        weekDates.forEach(function (wd) {
            html += '<div class="week-day-header">' +
                '<div class="week-day-label">' + wd.weekday + '</div>' +
                '<div class="week-date-label">' + wd.label + '</div>' +
                '</div>';
        });
        html += '</div>';

        beds.forEach(function (bed) {
            html += '<div class="week-bed-row">';
            html += '<div class="week-bed-label">' + bed.name + '</div>';
            weekDates.forEach(function (wd) {
                var appts = getBedSchedule(bed.id, wd.date);
                var releasedSlots = Store.getAll('releasedSlots').filter(function (s) {
                    return s.date === wd.date && s.bedId === bed.id;
                });

                html += '<div class="week-day-cell">';

                releasedSlots.forEach(function (slot) {
                    var topPct = ((slot.startTime - 9) / 12) * 100;
                    var heightPct = ((slot.endTime - slot.startTime) / 12) * 100;
                    var isRecent = (new Date() - new Date(slot.releasedAt)) < 10000;
                    var highlightClass = isRecent ? 'slot-highlight' : '';
                    html += '<div class="week-slot free ' + highlightClass + '" style="top:' + topPct + '%;height:' + heightPct + '%">' +
                        '<span class="slot-time">' + formatTime(slot.startTime) + '</span>' +
                        '<span class="slot-status">可预约</span>' +
                        '</div>';
                });

                appts.forEach(function (appt) {
                    var customer = customers.find(function (c) { return c.id === appt.customerId; });
                    var topPct = ((appt.startTime - 9) / 12) * 100;
                    var heightPct = ((appt.endTime - appt.startTime) / 12) * 100;
                    var filterClass = matchFilter(appt) ? 'filtered-in' : 'filtered-out';
                    html += '<div class="week-slot booked ' + filterClass + '" style="top:' + topPct + '%;height:' + heightPct + '%" ' +
                        'data-action="view-appointment" data-id="' + appt.id + '" ' +
                        'title="' + (customer ? customer.name : '') + ' ' + appt.serviceName + '">' +
                        '<span class="slot-time">' + formatTime(appt.startTime) + '</span>' +
                        '<span class="slot-customer">' + (customer ? customer.name : '') + '</span>' +
                        '<span class="slot-service">' + appt.serviceName + '</span>' +
                        '</div>';
                });

                html += '</div>';
            });
            html += '</div>';
        });

        html += '</div>';
        return html;
    }

    function bindFilterEvents() {
        var fb = document.getElementById('filter-beautician');
        var fs = document.getElementById('filter-service');
        var fbe = document.getElementById('filter-bed');

        if (fb) fb.onchange = function () {
            filters.beauticianId = this.value;
            refresh();
        };
        if (fs) fs.onchange = function () {
            filters.serviceType = this.value;
            refresh();
        };
        if (fbe) fbe.onchange = function () {
            filters.bedId = this.value;
            refresh();
        };
    }

    function bindViewToggleEvents() {
        document.querySelectorAll('.view-toggle-btn').forEach(function (btn) {
            btn.onclick = function () {
                currentView = this.getAttribute('data-view');
                refresh();
            };
        });
    }

    function formatTime(hour) {
        var h = Math.floor(hour);
        var m = (hour % 1 === 0.5) ? 30 : 0;
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    function showBedForm(bed) {
        var isEdit = !!bed;
        var title = isEdit ? '编辑美容床' : '美容床建档';

        var html = '<form id="bed-form">' +
            '<div class="form-group">' +
            '<label>美容床名称 <span class="required">*</span></label>' +
            '<input type="text" id="bed-name" class="form-input" value="' + (isEdit ? bed.name : '') + '" required placeholder="例如：A1号床">' +
            '</div>' +
            '<div class="form-group">' +
            '<label>位置</label>' +
            '<input type="text" id="bed-location" class="form-input" value="' + (isEdit ? (bed.location || '') : '') + '" placeholder="例如：一楼VIP区">' +
            '</div>' +
            '<div class="form-group">' +
            '<label>配备设备</label>' +
            '<input type="text" id="bed-equipment" class="form-input" value="' + (isEdit ? (bed.equipment || '') : '') + '" placeholder="例如：蒸汽机、LED光疗仪">' +
            '</div>' +
            '</form>';

        var footerHtml = '<button class="btn btn-primary" id="btn-save-bed">保存</button>' +
            '<button class="btn btn-outline" id="btn-cancel-modal">取消</button>';

        App.showModal(title, html, footerHtml);

        setTimeout(function () {
            var saveBtn = document.getElementById('btn-save-bed');
            var cancelBtn = document.getElementById('btn-cancel-modal');
            if (saveBtn) {
                saveBtn.onclick = function () {
                    var name = document.getElementById('bed-name').value.trim();
                    if (!name) { App.showToast('请输入美容床名称', 'error'); return; }
                    var location = document.getElementById('bed-location').value.trim();
                    var equipment = document.getElementById('bed-equipment').value.trim();

                    if (isEdit) {
                        updateBed(bed.id, { name: name, location: location, equipment: equipment });
                        App.showToast('美容床信息已更新', 'success');
                    } else {
                        var result = addBed(name, location, equipment);
                        if (!result) return;
                        App.showToast('美容床建档成功', 'success');
                    }
                    App.hideModal();
                    refresh();
                };
            }
            if (cancelBtn) cancelBtn.onclick = App.hideModal;
        }, 100);
    }

    function showCustomerForm(customer) {
        var isEdit = !!customer;
        var title = isEdit ? '编辑顾客' : '顾客登记';

        var skinOptions = [
            { value: 'normal', label: '中性肌肤' },
            { value: 'dry', label: '干性肌肤' },
            { value: 'oily', label: '油性肌肤' },
            { value: 'combination', label: '混合性肌肤' },
            { value: 'sensitive', label: '敏感性肌肤' },
            { value: 'unknown', label: '未检测' }
        ];

        var skinSelectHtml = skinOptions.map(function (opt) {
            var selected = isEdit && customer.skinType === opt.value ? 'selected' : '';
            return '<option value="' + opt.value + '" ' + selected + '>' + opt.label + '</option>';
        }).join('');

        var html = '<form id="customer-form">' +
            '<div class="form-group">' +
            '<label>顾客姓名 <span class="required">*</span></label>' +
            '<input type="text" id="customer-name" class="form-input" value="' + (isEdit ? customer.name : '') + '" required>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>手机号 <span class="required">*</span></label>' +
            '<input type="tel" id="customer-phone" class="form-input" value="' + (isEdit ? customer.phone : '') + '" required>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>肤质类型</label>' +
            '<select id="customer-skin" class="form-input">' + skinSelectHtml + '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>备注</label>' +
            '<textarea id="customer-notes" class="form-input" rows="3">' + (isEdit ? (customer.notes || '') : '') + '</textarea>' +
            '</div>' +
            '</form>';

        var footerHtml = '<button class="btn btn-primary" id="btn-save-customer">保存</button>' +
            '<button class="btn btn-outline" id="btn-cancel-modal">取消</button>';

        App.showModal(title, html, footerHtml);

        setTimeout(function () {
            var saveBtn = document.getElementById('btn-save-customer');
            if (saveBtn) {
                saveBtn.onclick = function () {
                    var name = document.getElementById('customer-name').value.trim();
                    var phone = document.getElementById('customer-phone').value.trim();
                    if (!name || !phone) { App.showToast('请填写必填项', 'error'); return; }
                    var skinType = document.getElementById('customer-skin').value;
                    var notes = document.getElementById('customer-notes').value.trim();

                    if (isEdit) {
                        updateCustomer(customer.id, { name: name, phone: phone, skinType: skinType, notes: notes });
                        App.showToast('顾客信息已更新', 'success');
                    } else {
                        var result = addCustomer(name, phone, skinType, notes);
                        if (!result) return;
                        App.showToast('顾客登记成功', 'success');
                    }
                    App.hideModal();
                    refresh();
                };
            }
            document.getElementById('btn-cancel-modal').onclick = App.hideModal;
        }, 100);
    }

    function showBeauticianForm(beautician) {
        var isEdit = !!beautician;
        var title = isEdit ? '编辑美容师' : '美容师登记';

        var allSpecs = ['面部护理', '身体SPA', '抗衰老', '美白', '纤体塑形', '敏感肌修复', '深层清洁', '补水保湿', '眼部护理', '颈部护理', '芳香疗法'];
        var allExpertise = ['normal', 'dry', 'oily', 'combination', 'sensitive'];

        var specsHtml = allSpecs.map(function (s) {
            var checked = isEdit && beautician.specialties && beautician.specialties.indexOf(s) >= 0 ? 'checked' : '';
            return '<label class="checkbox-label"><input type="checkbox" name="spec" value="' + s + '" ' + checked + '> ' + s + '</label>';
        }).join('');

        var expLabels = {
            normal: '中性肌肤', dry: '干性肌肤', oily: '油性肌肤',
            combination: '混合性肌肤', sensitive: '敏感性肌肤'
        };
        var expHtml = allExpertise.map(function (e) {
            var checked = isEdit && beautician.expertise && beautician.expertise.indexOf(e) >= 0 ? 'checked' : '';
            return '<label class="checkbox-label"><input type="checkbox" name="exp" value="' + e + '" ' + checked + '> ' + expLabels[e] + '</label>';
        }).join('');

        var html = '<form id="beautician-form">' +
            '<div class="form-group">' +
            '<label>美容师姓名 <span class="required">*</span></label>' +
            '<input type="text" id="beautician-name" class="form-input" value="' + (isEdit ? beautician.name : '') + '" required>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>手机号</label>' +
            '<input type="tel" id="beautician-phone" class="form-input" value="' + (isEdit ? (beautician.phone || '') : '') + '">' +
            '</div>' +
            '<div class="form-group">' +
            '<label>擅长项目</label>' +
            '<div class="checkbox-group">' + specsHtml + '</div>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>擅长肤质</label>' +
            '<div class="checkbox-group">' + expHtml + '</div>' +
            '</div>' +
            '</form>';

        var footerHtml = '<button class="btn btn-primary" id="btn-save-beautician">保存</button>' +
            '<button class="btn btn-outline" id="btn-cancel-modal">取消</button>';

        App.showModal(title, html, footerHtml);

        setTimeout(function () {
            var saveBtn = document.getElementById('btn-save-beautician');
            if (saveBtn) {
                saveBtn.onclick = function () {
                    var name = document.getElementById('beautician-name').value.trim();
                    if (!name) { App.showToast('请输入美容师姓名', 'error'); return; }
                    var phone = document.getElementById('beautician-phone').value.trim();
                    var specs = [];
                    document.querySelectorAll('input[name="spec"]:checked').forEach(function (cb) {
                        specs.push(cb.value);
                    });
                    var exp = [];
                    document.querySelectorAll('input[name="exp"]:checked').forEach(function (cb) {
                        exp.push(cb.value);
                    });

                    if (isEdit) {
                        updateBeautician(beautician.id, { name: name, phone: phone, specialties: specs, expertise: exp });
                        App.showToast('美容师信息已更新', 'success');
                    } else {
                        addBeautician(name, phone, specs, exp);
                        App.showToast('美容师登记成功', 'success');
                    }
                    App.hideModal();
                    refresh();
                };
            }
            document.getElementById('btn-cancel-modal').onclick = App.hideModal;
        }, 100);
    }

    function showAppointmentForm(prefill) {
        var beds = Store.getAll('beds');
        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');

        if (beds.length === 0) { App.showToast('请先添加美容床', 'warning'); return; }
        if (customers.length === 0) { App.showToast('请先登记顾客', 'warning'); return; }
        if (beauticians.length === 0) { App.showToast('请先登记美容师', 'warning'); return; }

        prefill = prefill || {};
        var dateInput = document.getElementById('scheduler-date');
        var selectedDate = prefill.date || (dateInput ? dateInput.value : new Date().toISOString().split('T')[0]);

        var bedOptions = beds.map(function (b) {
            var sel = prefill.bedId === b.id ? 'selected' : '';
            return '<option value="' + b.id + '" ' + sel + '>' + b.name + ' (' + (b.location || '默认') + ')</option>';
        }).join('');

        var customerOptions = customers.map(function (c) {
            var sel = prefill.customerId === c.id ? 'selected' : '';
            return '<option value="' + c.id + '" ' + sel + '>' + c.name + ' (' + c.phone + ')</option>';
        }).join('');

        var beauticianOptions = beauticians.map(function (b) {
            var sel = prefill.beauticianId === b.id ? 'selected' : '';
            return '<option value="' + b.id + '" ' + sel + '>' + b.name + '</option>';
        }).join('');

        var serviceOptions = SERVICE_TYPES.map(function (s) {
            return '<option value="' + s.id + '" data-duration="' + s.duration + '">' + s.name + ' (' + s.duration + '分钟)</option>';
        }).join('');

        var timeOptions = TIME_SLOTS.map(function (t) {
            return '<option value="' + t.hour + '">' + t.label + '</option>';
        }).join('');

        var html = '<form id="appointment-form">' +
            '<div class="form-row">' +
            '<div class="form-group">' +
            '<label>选择美容床 <span class="required">*</span></label>' +
            '<select id="appt-bed" class="form-input">' + bedOptions + '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>日期 <span class="required">*</span></label>' +
            '<input type="date" id="appt-date" class="form-input" value="' + selectedDate + '">' +
            '</div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group">' +
            '<label>选择顾客 <span class="required">*</span></label>' +
            '<select id="appt-customer" class="form-input">' + customerOptions + '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>选择美容师 <span class="required">*</span></label>' +
            '<select id="appt-beautician" class="form-input">' + beauticianOptions + '</select>' +
            '</div>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>护理项目 <span class="required">*</span></label>' +
            '<select id="appt-service" class="form-input">' + serviceOptions + '</select>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group">' +
            '<label>开始时间 <span class="required">*</span></label>' +
            '<select id="appt-start" class="form-input">' + timeOptions + '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>结束时间 <span class="required">*</span></label>' +
            '<select id="appt-end" class="form-input">' + timeOptions + '</select>' +
            '</div>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>备注</label>' +
            '<textarea id="appt-notes" class="form-input" rows="2"></textarea>' +
            '</div>' +
            '</form>';

        var footerHtml = '<button class="btn btn-primary" id="btn-save-appointment">确认预约</button>' +
            '<button class="btn btn-outline" id="btn-cancel-modal">取消</button>';

        App.showModal('新建预约', html, footerHtml);

        setTimeout(function () {
            var serviceSelect = document.getElementById('appt-service');
            var endSelect = document.getElementById('appt-end');
            var startSelect = document.getElementById('appt-start');

            function autoSetEndTime() {
                var svc = SERVICE_TYPES.find(function (s) { return s.id === serviceSelect.value; });
                if (svc) {
                    var startHour = parseFloat(startSelect.value);
                    var endHour = startHour + svc.duration / 60;
                    for (var i = 0; i < TIME_SLOTS.length; i++) {
                        if (TIME_SLOTS[i].hour >= endHour) {
                            endSelect.value = TIME_SLOTS[i].hour;
                            break;
                        }
                    }
                }
            }

            serviceSelect.onchange = autoSetEndTime;
            startSelect.onchange = autoSetEndTime;
            autoSetEndTime();

            var saveBtn = document.getElementById('btn-save-appointment');
            if (saveBtn) {
                saveBtn.onclick = function () {
                    var data = {
                        bedId: document.getElementById('appt-bed').value,
                        customerId: document.getElementById('appt-customer').value,
                        beauticianId: document.getElementById('appt-beautician').value,
                        date: document.getElementById('appt-date').value,
                        startTime: parseFloat(document.getElementById('appt-start').value),
                        endTime: parseFloat(document.getElementById('appt-end').value),
                        serviceType: serviceSelect.value,
                        notes: document.getElementById('appt-notes').value.trim()
                    };

                    if (data.endTime <= data.startTime) {
                        App.showToast('结束时间必须晚于开始时间', 'error');
                        return;
                    }

                    var result = createAppointment(data);
                    if (result) {
                        App.hideModal();
                        App.showToast('预约创建成功', 'success');
                        refresh();
                    }
                };
            }
            document.getElementById('btn-cancel-modal').onclick = App.hideModal;
        }, 100);
    }

    function refresh() {
        var dateInput = document.getElementById('scheduler-date');
        var date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        renderBedList();
        renderTodayAppointments(date);
        renderTimeline(date);
        updateStats();
    }

    function updateStats() {
        var bedCount = Store.count('beds');
        var today = new Date().toISOString().split('T')[0];
        var todayAppts = Store.count('appointments', function (a) {
            return a.date === today && a.status === 'booked';
        });
        var matchCount = Store.count('matches', function (m) { return m.status === 'matched'; });

        var el1 = document.getElementById('stat-beds');
        var el2 = document.getElementById('stat-today');
        var el3 = document.getElementById('stat-matches');
        if (el1) el1.textContent = bedCount;
        if (el2) el2.textContent = todayAppts;
        if (el3) el3.textContent = matchCount;
    }

    return {
        getTimeSlots: getTimeSlots,
        getServiceTypes: getServiceTypes,
        addBed: addBed,
        updateBed: updateBed,
        deleteBed: deleteBed,
        addCustomer: addCustomer,
        updateCustomer: updateCustomer,
        deleteCustomer: deleteCustomer,
        addBeautician: addBeautician,
        updateBeautician: updateBeautician,
        deleteBeautician: deleteBeautician,
        createAppointment: createAppointment,
        cancelAppointment: cancelAppointment,
        getAppointmentsByDate: getAppointmentsByDate,
        getBookedAppointmentsByDate: getBookedAppointmentsByDate,
        getBedSchedule: getBedSchedule,
        renderBedList: renderBedList,
        renderTodayAppointments: renderTodayAppointments,
        renderTimeline: renderTimeline,
        formatTime: formatTime,
        showBedForm: showBedForm,
        showCustomerForm: showCustomerForm,
        showBeauticianForm: showBeauticianForm,
        showAppointmentForm: showAppointmentForm,
        refresh: refresh,
        updateStats: updateStats
    };
})();

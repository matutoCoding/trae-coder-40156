var App = (function () {
    var currentModule = 'scheduler';

    function init() {
        setupNavigation();
        setupToolbarButtons();
        setupDateInputs();
        setupGlobalClickHandlers();
        setupDataActions();
        setupDesktopIntegration();
        switchModule('scheduler');
    }

    function setupNavigation() {
        var navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(function (item) {
            item.addEventListener('click', function (e) {
                e.preventDefault();
                var module = this.getAttribute('data-module');
                switchModule(module);
            });
        });
    }

    function switchModule(moduleName) {
        currentModule = moduleName;

        document.querySelectorAll('.nav-item').forEach(function (item) {
            item.classList.toggle('active', item.getAttribute('data-module') === moduleName);
        });

        document.querySelectorAll('.module-panel').forEach(function (panel) {
            panel.classList.toggle('active', panel.id === 'panel-' + moduleName);
        });

        var titles = {
            scheduler: '护理排期',
            conflict: '冲突校验',
            matching: '双向撮合',
            affinity: '契合排序'
        };
        var titleEl = document.getElementById('module-title');
        if (titleEl) titleEl.textContent = titles[moduleName] || '';

        refreshModule(moduleName);
    }

    function refreshModule(moduleName) {
        switch (moduleName) {
            case 'scheduler':
                Scheduler.refresh();
                break;
            case 'conflict':
                var cDate = document.getElementById('conflict-date');
                Conflict.refresh(cDate ? cDate.value : new Date().toISOString().split('T')[0]);
                break;
            case 'matching':
                Matching.refresh();
                break;
            case 'affinity':
                Affinity.refresh();
                break;
        }
    }

    function setupToolbarButtons() {
        var btnAddBed = document.getElementById('btn-add-bed');
        if (btnAddBed) btnAddBed.addEventListener('click', function () { Scheduler.showBedForm(null); });

        var btnAddAppt = document.getElementById('btn-add-appointment');
        if (btnAddAppt) btnAddAppt.addEventListener('click', function () { Scheduler.showAppointmentForm(); });

        var btnAddCustomer = document.getElementById('btn-add-customer');
        if (btnAddCustomer) btnAddCustomer.addEventListener('click', function () { Scheduler.showCustomerForm(null); });

        var btnAddBeautician = document.getElementById('btn-add-beautician');
        if (btnAddBeautician) btnAddBeautician.addEventListener('click', function () { Scheduler.showBeauticianForm(null); });

        var btnCheckConflict = document.getElementById('btn-check-conflict');
        if (btnCheckConflict) btnCheckConflict.addEventListener('click', function () {
            var cDate = document.getElementById('conflict-date');
            var date = cDate ? cDate.value : new Date().toISOString().split('T')[0];
            var conflicts = Conflict.detectConflicts();
            Conflict.refresh(date);
            if (conflicts.length === 0) {
                showToast('未检测到冲突，所有预约时段正常', 'success');
            } else {
                showToast('检测到 ' + conflicts.length + ' 处时段冲突', 'error');
            }
        });

        var btnViewReleased = document.getElementById('btn-view-released');
        if (btnViewReleased) btnViewReleased.addEventListener('click', function () {
            Conflict.renderReleasedList();
            showToast('已刷新释放时段列表', 'info');
        });

        var btnRegisterIntention = document.getElementById('btn-register-intention');
        if (btnRegisterIntention) btnRegisterIntention.addEventListener('click', function () {
            Matching.showIntentionForm();
        });

        var btnDoMatch = document.getElementById('btn-do-match');
        if (btnDoMatch) btnDoMatch.addEventListener('click', function () {
            var newMatches = Matching.executeMatching();
            Matching.refresh();
            if (newMatches.length > 0) {
                showToast('撮合成功！新增 ' + newMatches.length + ' 对匹配', 'success');
            } else {
                showToast('未发现新的双向意愿匹配', 'info');
            }
        });

        var btnAddSkinProfile = document.getElementById('btn-add-skin-profile');
        if (btnAddSkinProfile) btnAddSkinProfile.addEventListener('click', function () {
            Affinity.showSkinProfileForm(null);
        });

        var btnCalcAffinity = document.getElementById('btn-calc-affinity');
        if (btnCalcAffinity) btnCalcAffinity.addEventListener('click', function () {
            var results = Affinity.calculateAllAffinities();
            Affinity.refresh();
            showToast('契合度计算完成，共 ' + results.length + ' 组配对', 'success');
        });
    }

    function setupDateInputs() {
        var today = new Date().toISOString().split('T')[0];

        var schedDate = document.getElementById('scheduler-date');
        if (schedDate) {
            schedDate.value = today;
            schedDate.addEventListener('change', function () {
                Scheduler.refresh();
            });
        }

        var conflictDate = document.getElementById('conflict-date');
        if (conflictDate) {
            conflictDate.value = today;
            conflictDate.addEventListener('change', function () {
                Conflict.refresh(conflictDate.value);
            });
        }
    }

    function setupDataActions() {
        var exportBtn = document.getElementById('btn-export-data');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                exportData();
            });
        }

        var importBtn = document.getElementById('btn-import-data');
        var fileInput = document.getElementById('import-file-input');
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', function () {
                fileInput.click();
            });
            fileInput.addEventListener('change', function (e) {
                if (e.target.files && e.target.files.length > 0) {
                    var file = e.target.files[0];
                    importData(file);
                    fileInput.value = '';
                }
            });
        }
    }

    function exportData() {
        var dataStr = Store.exportData();
        var blob = new Blob([dataStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);

        var a = document.createElement('a');
        a.href = url;
        var now = new Date();
        var dateStr = now.getFullYear() +
            ('0' + (now.getMonth() + 1)).slice(-2) +
            ('0' + now.getDate()).slice(-2) +
            ('0' + now.getHours()).slice(-2) +
            ('0' + now.getMinutes()).slice(-2);
        a.download = '美容院数据备份_' + dateStr + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('数据导出成功，共导出完整档案', 'success');
    }

    function importData(file) {
        if (!file) return;

        if (!confirm('导入数据将覆盖当前所有数据，确定继续吗？\n\n建议先导出当前数据进行备份。')) {
            return;
        }

        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var jsonStr = e.target.result;
                var success = Store.importData(jsonStr);
                if (success) {
                    Scheduler.refresh();
                    Conflict.refresh(new Date().toISOString().split('T')[0]);
                    Matching.refresh();
                    Affinity.refresh();
                    showToast('数据导入成功！', 'success');
                } else {
                    showToast('导入失败：文件格式不正确', 'error');
                }
            } catch (err) {
                showToast('导入失败：' + err.message, 'error');
            }
        };
        reader.onerror = function () {
            showToast('读取文件失败', 'error');
        };
        reader.readAsText(file);
    }

    function setupDesktopIntegration() {
        if (!window.desktopAPI) return;

        window.desktopAPI.onExportData(function (filePath) {
            try {
                var dataStr = Store.exportData();
                if (filePath) {
                    window.desktopAPI.saveFile(dataStr, filePath);
                    window.desktopAPI.sendExportComplete(true);
                    showToast('数据已导出到: ' + filePath, 'success');
                } else {
                    window.desktopAPI.sendExportComplete(false);
                }
            } catch (e) {
                window.desktopAPI.sendExportComplete(false);
                showToast('导出失败: ' + e.message, 'error');
            }
        });

        window.desktopAPI.onImportData(function (filePath) {
            if (!filePath) return;
            window.desktopAPI.readFile(filePath).then(function (content) {
                if (!content) {
                    window.desktopAPI.sendImportComplete(false);
                    showToast('导入失败：无法读取文件', 'error');
                    return;
                }
                try {
                    var success = Store.importData(content);
                    if (success) {
                        Scheduler.refresh();
                        Conflict.refresh(new Date().toISOString().split('T')[0]);
                        Matching.refresh();
                        Affinity.refresh();
                        window.desktopAPI.sendImportComplete(true);
                        showToast('数据导入成功！', 'success');
                    } else {
                        window.desktopAPI.sendImportComplete(false);
                        showToast('导入失败：文件格式不正确', 'error');
                    }
                } catch (e) {
                    window.desktopAPI.sendImportComplete(false);
                    showToast('导入失败: ' + e.message, 'error');
                }
            });
        });

        window.desktopAPI.onClearData(function () {
            Store.clearAll();
            Scheduler.refresh();
            Conflict.refresh(new Date().toISOString().split('T')[0]);
            Matching.refresh();
            Affinity.refresh();
            showToast('本地数据已全部清除', 'success');
        });
    }

    function setupGlobalClickHandlers() {
        document.addEventListener('click', function (e) {
            var target = e.target.closest('[data-action]');
            if (!target) return;

            var action = target.getAttribute('data-action');
            var id = target.getAttribute('data-id');

            switch (action) {
                case 'edit-bed':
                    var bed = Store.getById('beds', id);
                    if (bed) Scheduler.showBedForm(bed);
                    break;

                case 'delete-bed':
                    if (confirm('确定删除该美容床？')) {
                        Scheduler.deleteBed(id);
                        Scheduler.refresh();
                    }
                    break;

                case 'cancel-appointment':
                    if (confirm('确定取消该预约？取消后时段将被释放。')) {
                        Scheduler.cancelAppointment(id);
                        refreshModule(currentModule);
                    }
                    break;

                case 'view-appointment':
                    showAppointmentDetail(id);
                    break;

                case 'resolve-cancel':
                    if (confirm('确定取消该预约以解决冲突？')) {
                        Conflict.releaseSlot(id);
                        refreshModule(currentModule);
                    }
                    break;

                case 'withdraw-intention':
                    if (confirm('确定撤回该意愿？')) {
                        Matching.withdrawIntention(id);
                        Matching.refresh();
                    }
                    break;

                case 'cancel-match':
                    if (confirm('确定取消该撮合？取消后双方意愿恢复为待定状态。')) {
                        Matching.cancelMatch(id);
                        Matching.refresh();
                    }
                    break;

                case 'edit-skin-profile':
                    var profile = Store.getById('skinProfiles', id);
                    if (profile) Affinity.showSkinProfileForm(profile);
                    break;
            }
        });
    }

    function showAppointmentDetail(id) {
        var appt = Store.getById('appointments', id);
        if (!appt) return;

        var customer = Store.getById('customers', appt.customerId);
        var beautician = Store.getById('beauticians', appt.beauticianId);
        var bed = Store.getById('beds', appt.bedId);

        var statusMap = { booked: '已预约', cancelled: '已取消' };

        var html = '<div class="detail-view">' +
            '<div class="detail-row"><span class="detail-label">顾客</span><span class="detail-value">' + (customer ? customer.name : '未知') + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">美容师</span><span class="detail-value">' + (beautician ? beautician.name : '未知') + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">美容床</span><span class="detail-value">' + (bed ? bed.name : '未知') + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">日期</span><span class="detail-value">' + appt.date + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">时段</span><span class="detail-value">' + Scheduler.formatTime(appt.startTime) + ' - ' + Scheduler.formatTime(appt.endTime) + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">项目</span><span class="detail-value">' + appt.serviceName + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">状态</span><span class="detail-value">' + (statusMap[appt.status] || appt.status) + '</span></div>' +
            (appt.notes ? '<div class="detail-row"><span class="detail-label">备注</span><span class="detail-value">' + appt.notes + '</span></div>' : '') +
            '</div>';

        if (appt.status === 'booked') {
            var footerHtml = '<button class="btn btn-warning" id="btn-detail-cancel">取消预约</button>' +
                '<button class="btn btn-outline" id="btn-cancel-modal">关闭</button>';
            showModal('预约详情', html, footerHtml);
            setTimeout(function () {
                var cancelBtn = document.getElementById('btn-detail-cancel');
                if (cancelBtn) cancelBtn.onclick = function () {
                    if (confirm('确定取消该预约？')) {
                        Scheduler.cancelAppointment(id);
                        hideModal();
                        refreshModule(currentModule);
                    }
                };
                document.getElementById('btn-cancel-modal').onclick = hideModal;
            }, 100);
        } else {
            showModal('预约详情', html, '<button class="btn btn-outline" id="btn-cancel-modal">关闭</button>');
            setTimeout(function () {
                document.getElementById('btn-cancel-modal').onclick = hideModal;
            }, 100);
        }
    }

    function showModal(title, bodyHtml, footerHtml) {
        var overlay = document.getElementById('modal-overlay');
        var titleEl = document.getElementById('modal-title');
        var bodyEl = document.getElementById('modal-body');
        var footerEl = document.getElementById('modal-footer');

        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.innerHTML = bodyHtml;
        if (footerEl) footerEl.innerHTML = footerHtml || '';
        if (overlay) overlay.classList.add('active');

        var closeBtn = document.getElementById('modal-close');
        if (closeBtn) {
            closeBtn.onclick = hideModal;
        }
    }

    function hideModal() {
        var overlay = document.getElementById('modal-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    function showToast(message, type) {
        var container = document.getElementById('toast-container');
        if (!container) return;

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + (type || 'info');
        toast.innerHTML = '<span class="toast-icon">' +
            (type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️') +
            '</span><span class="toast-msg">' + message + '</span>';

        container.appendChild(toast);

        setTimeout(function () {
            toast.classList.add('fade-out');
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3000);
    }

    document.addEventListener('DOMContentLoaded', init);

    return {
        showModal: showModal,
        hideModal: hideModal,
        showToast: showToast,
        switchModule: switchModule,
        refreshModule: refreshModule
    };
})();

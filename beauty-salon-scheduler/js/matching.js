var Matching = (function () {

    function registerIntention(customerId, beauticianId, direction, serviceType) {
        var existing = Store.query('intentions', function (i) {
            return i.customerId === customerId &&
                i.beauticianId === beauticianId &&
                i.direction === direction;
        });

        if (existing.length > 0) {
            App.showToast('该意愿已登记', 'warning');
            return existing[0];
        }

        return Store.add('intentions', {
            customerId: customerId,
            beauticianId: beauticianId,
            direction: direction,
            serviceType: serviceType || '',
            status: 'pending'
        });
    }

    function withdrawIntention(id) {
        var intention = Store.getById('intentions', id);
        if (!intention) return null;

        var matches = Store.query('matches', function (m) {
            return m.status === 'matched' &&
                ((m.customerId === intention.customerId && m.beauticianId === intention.beauticianId));
        });

        if (matches.length > 0) {
            App.showToast('已撮合成功的意愿不能直接撤回，请先取消撮合', 'error');
            return null;
        }

        Store.remove('intentions', id);
        App.showToast('意愿已撤回', 'success');
        return true;
    }

    function executeMatching() {
        var intentions = Store.getAll('intentions');
        var customerIntentions = intentions.filter(function (i) { return i.direction === 'customer_to_beautician'; });
        var beauticianIntentions = intentions.filter(function (i) { return i.direction === 'beautician_to_customer'; });

        var newMatches = [];
        var matchedIntentionIds = [];

        customerIntentions.forEach(function (ci) {
            beauticianIntentions.forEach(function (bi) {
                if (ci.customerId === bi.customerId && ci.beauticianId === bi.beauticianId) {
                    var existingMatch = Store.query('matches', function (m) {
                        return m.customerId === ci.customerId &&
                            m.beauticianId === bi.beauticianId &&
                            m.status === 'matched';
                    });

                    if (existingMatch.length === 0) {
                        var score = Affinity.calculateScore(ci.customerId, ci.beauticianId);
                        var match = Store.add('matches', {
                            customerId: ci.customerId,
                            beauticianId: ci.beauticianId,
                            customerIntentionId: ci.id,
                            beauticianIntentionId: bi.id,
                            compatibilityScore: score.total,
                            scoreDetail: score,
                            status: 'matched',
                            matchedAt: new Date().toISOString()
                        });
                        newMatches.push(match);
                        matchedIntentionIds.push(ci.id, bi.id);
                    }
                }
            });
        });

        matchedIntentionIds.forEach(function (id) {
            Store.update('intentions', id, { status: 'matched' });
        });

        return newMatches;
    }

    function cancelMatch(matchId) {
        var match = Store.getById('matches', matchId);
        if (!match) return null;

        Store.update('matches', matchId, { status: 'cancelled' });

        if (match.customerIntentionId) {
            Store.update('intentions', match.customerIntentionId, { status: 'pending' });
        }
        if (match.beauticianIntentionId) {
            Store.update('intentions', match.beauticianIntentionId, { status: 'pending' });
        }

        App.showToast('撮合已取消，意愿已恢复为待定', 'success');
        return true;
    }

    function getMatchedPairs() {
        return Store.query('matches', function (m) { return m.status === 'matched'; });
    }

    function getPendingIntentions() {
        return Store.query('intentions', function (i) { return i.status === 'pending'; });
    }

    function renderCustomerIntentions() {
        var container = document.getElementById('customer-intentions');
        if (!container) return;

        var intentions = Store.query('intentions', function (i) {
            return i.direction === 'customer_to_beautician';
        });
        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');

        if (intentions.length === 0) {
            container.innerHTML = '<div class="empty-hint">暂无顾客意愿</div>';
            return;
        }

        container.innerHTML = intentions.map(function (i) {
            var customer = customers.find(function (c) { return c.id === i.customerId; });
            var beautician = beauticians.find(function (b) { return b.id === i.beauticianId; });
            var statusClass = i.status === 'matched' ? 'status-matched' : 'status-pending';
            var statusText = i.status === 'matched' ? '已撮合' : '待撮合';

            return '<div class="list-item intention-item customer-intention">' +
                '<div class="item-main">' +
                '<span class="direction-arrow">→</span>' +
                '<div class="item-info">' +
                '<strong>' + (customer ? customer.name : '未知') + '</strong>' +
                '<small>希望选择 ' + (beautician ? beautician.name : '未知') + '</small>' +
                '<span class="intention-status ' + statusClass + '">' + statusText + '</span>' +
                '</div>' +
                '</div>' +
                '<div class="item-actions">' +
                (i.status === 'pending' ?
                    '<button class="btn-icon btn-delete" data-action="withdraw-intention" data-id="' + i.id + '" title="撤回">🗑️</button>' : '') +
                '</div>' +
                '</div>';
        }).join('');
    }

    function renderBeauticianIntentions() {
        var container = document.getElementById('beautician-intentions');
        if (!container) return;

        var intentions = Store.query('intentions', function (i) {
            return i.direction === 'beautician_to_customer';
        });
        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');

        if (intentions.length === 0) {
            container.innerHTML = '<div class="empty-hint">暂无美容师意愿</div>';
            return;
        }

        container.innerHTML = intentions.map(function (i) {
            var customer = customers.find(function (c) { return c.id === i.customerId; });
            var beautician = beauticians.find(function (b) { return b.id === i.beauticianId; });
            var statusClass = i.status === 'matched' ? 'status-matched' : 'status-pending';
            var statusText = i.status === 'matched' ? '已撮合' : '待撮合';

            return '<div class="list-item intention-item beautician-intention">' +
                '<div class="item-main">' +
                '<span class="direction-arrow">←</span>' +
                '<div class="item-info">' +
                '<strong>' + (beautician ? beautician.name : '未知') + '</strong>' +
                '<small>希望服务 ' + (customer ? customer.name : '未知') + '</small>' +
                '<span class="intention-status ' + statusClass + '">' + statusText + '</span>' +
                '</div>' +
                '</div>' +
                '<div class="item-actions">' +
                (i.status === 'pending' ?
                    '<button class="btn-icon btn-delete" data-action="withdraw-intention" data-id="' + i.id + '" title="撤回">🗑️</button>' : '') +
                '</div>' +
                '</div>';
        }).join('');
    }

    function renderMatchSuccess() {
        var container = document.getElementById('match-success');
        if (!container) return;

        var matches = getMatchedPairs();
        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');

        if (matches.length === 0) {
            container.innerHTML = '<div class="empty-hint">暂无撮合成功记录</div>';
            return;
        }

        matches.sort(function (a, b) { return b.compatibilityScore - a.compatibilityScore; });

        container.innerHTML = matches.map(function (m) {
            var customer = customers.find(function (c) { return c.id === m.customerId; });
            var beautician = beauticians.find(function (b) { return b.id === m.beauticianId; });
            var matchedDate = new Date(m.matchedAt).toLocaleDateString('zh-CN');

            return '<div class="list-item match-item match-success-item">' +
                '<div class="match-avatars">' +
                '<span class="avatar customer-avatar">' + (customer ? customer.name.charAt(0) : '?') + '</span>' +
                '<span class="match-link">🤝</span>' +
                '<span class="avatar beautician-avatar">' + (beautician ? beautician.name.charAt(0) : '?') + '</span>' +
                '</div>' +
                '<div class="item-info">' +
                '<strong>' + (customer ? customer.name : '未知') + ' ↔ ' + (beautician ? beautician.name : '未知') + '</strong>' +
                '<small>契合度: ' + m.compatibilityScore + '分 | 撮合于 ' + matchedDate + '</small>' +
                '</div>' +
                '<div class="item-actions">' +
                '<button class="btn btn-sm btn-primary btn-match-create" data-action="create-appointment-from-match" data-customer="' + m.customerId + '" data-beautician="' + m.beauticianId + '">📅 创建预约</button>' +
                '<button class="btn btn-sm btn-warning" data-action="cancel-match" data-id="' + m.id + '">取消撮合</button>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function renderMatchPending() {
        var container = document.getElementById('match-pending');
        if (!container) return;

        var pending = getPendingIntentions();
        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');

        var pendingPairs = {};
        pending.forEach(function (i) {
            var key = i.customerId + '_' + i.beauticianId;
            if (!pendingPairs[key]) {
                pendingPairs[key] = { customerId: i.customerId, beauticianId: i.beauticianId, customerWilling: false, beauticianWilling: false };
            }
            if (i.direction === 'customer_to_beautician') {
                pendingPairs[key].customerWilling = true;
            } else {
                pendingPairs[key].beauticianWilling = true;
            }
        });

        var pairList = Object.values(pendingPairs);
        if (pairList.length === 0) {
            container.innerHTML = '<div class="empty-hint">暂无待撮合意愿</div>';
            return;
        }

        container.innerHTML = pairList.map(function (p) {
            var customer = customers.find(function (c) { return c.id === p.customerId; });
            var beautician = beauticians.find(function (b) { return b.id === p.beauticianId; });
            var missingSide = '';
            if (p.customerWilling && !p.beauticianWilling) {
                missingSide = '等待美容师回应';
            } else if (!p.customerWilling && p.beauticianWilling) {
                missingSide = '等待顾客回应';
            }

            return '<div class="list-item match-item match-pending-item">' +
                '<div class="match-avatars">' +
                '<span class="avatar customer-avatar ' + (p.customerWilling ? 'active' : 'inactive') + '">' + (customer ? customer.name.charAt(0) : '?') + '</span>' +
                '<span class="match-link">⏳</span>' +
                '<span class="avatar beautician-avatar ' + (p.beauticianWilling ? 'active' : 'inactive') + '">' + (beautician ? beautician.name.charAt(0) : '?') + '</span>' +
                '</div>' +
                '<div class="item-info">' +
                '<strong>' + (customer ? customer.name : '未知') + ' ↔ ' + (beautician ? beautician.name : '未知') + '</strong>' +
                '<small class="pending-reason">' + missingSide + '</small>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function showIntentionForm() {
        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');

        if (customers.length === 0) { App.showToast('请先登记顾客', 'warning'); return; }
        if (beauticians.length === 0) { App.showToast('请先登记美容师', 'warning'); return; }

        var customerOptions = customers.map(function (c) {
            return '<option value="' + c.id + '">' + c.name + '</option>';
        }).join('');

        var beauticianOptions = beauticians.map(function (b) {
            return '<option value="' + b.id + '">' + b.name + '</option>';
        }).join('');

        var serviceTypes = Scheduler.getServiceTypes();
        var serviceOptions = '<option value="">不限</option>' + serviceTypes.map(function (s) {
            return '<option value="' + s.id + '">' + s.name + '</option>';
        }).join('');

        var html = '<form id="intention-form">' +
            '<div class="form-group">' +
            '<label>意愿方向 <span class="required">*</span></label>' +
            '<select id="intention-direction" class="form-input">' +
            '<option value="customer_to_beautician">顾客 → 美容师（顾客选择美容师）</option>' +
            '<option value="beautician_to_customer">美容师 → 顾客（美容师选择顾客）</option>' +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>选择顾客 <span class="required">*</span></label>' +
            '<select id="intention-customer" class="form-input">' + customerOptions + '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>选择美容师 <span class="required">*</span></label>' +
            '<select id="intention-beautician" class="form-input">' + beauticianOptions + '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>意向服务项目</label>' +
            '<select id="intention-service" class="form-input">' + serviceOptions + '</select>' +
            '</div>' +
            '</form>';

        var footerHtml = '<button class="btn btn-primary" id="btn-save-intention">登记意愿</button>' +
            '<button class="btn btn-outline" id="btn-cancel-modal">取消</button>';

        App.showModal('登记意愿', html, footerHtml);

        setTimeout(function () {
            var saveBtn = document.getElementById('btn-save-intention');
            if (saveBtn) {
                saveBtn.onclick = function () {
                    var direction = document.getElementById('intention-direction').value;
                    var customerId = document.getElementById('intention-customer').value;
                    var beauticianId = document.getElementById('intention-beautician').value;
                    var serviceType = document.getElementById('intention-service').value;

                    var result = registerIntention(customerId, beauticianId, direction, serviceType);
                    if (result) {
                        App.hideModal();
                        App.showToast('意愿登记成功', 'success');
                        refresh();
                    }
                };
            }
            document.getElementById('btn-cancel-modal').onclick = App.hideModal;
        }, 100);
    }

    function refresh() {
        renderCustomerIntentions();
        renderBeauticianIntentions();
        renderMatchSuccess();
        renderMatchPending();
        Scheduler.updateStats();
    }

    return {
        registerIntention: registerIntention,
        withdrawIntention: withdrawIntention,
        executeMatching: executeMatching,
        cancelMatch: cancelMatch,
        getMatchedPairs: getMatchedPairs,
        getPendingIntentions: getPendingIntentions,
        renderCustomerIntentions: renderCustomerIntentions,
        renderBeauticianIntentions: renderBeauticianIntentions,
        renderMatchSuccess: renderMatchSuccess,
        renderMatchPending: renderMatchPending,
        showIntentionForm: showIntentionForm,
        refresh: refresh
    };
})();

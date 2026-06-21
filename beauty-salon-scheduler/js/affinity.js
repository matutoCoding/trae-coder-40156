var Affinity = (function () {

    var SKIN_TYPE_MAP = {
        'normal': '中性肌肤',
        'dry': '干性肌肤',
        'oily': '油性肌肤',
        'combination': '混合性肌肤',
        'sensitive': '敏感性肌肤',
        'unknown': '未检测'
    };

    var CONCERN_LIST = [
        '缺水干燥', '毛孔粗大', '色斑暗沉', '细纹松弛',
        '敏感泛红', '痘痘粉刺', '出油旺盛', '肤质粗糙',
        '黑眼圈', '颈部细纹'
    ];

    function getSkinTypeLabel(type) {
        return SKIN_TYPE_MAP[type] || type;
    }

    function getConcernList() {
        return CONCERN_LIST;
    }

    function createSkinProfile(data) {
        var existing = Store.query('skinProfiles', function (p) {
            return p.customerId === data.customerId;
        });
        if (existing.length > 0) {
            return Store.update('skinProfiles', existing[0].id, {
                skinType: data.skinType,
                sensitivity: data.sensitivity,
                hydration: data.hydration,
                elasticity: data.elasticity,
                concerns: data.concerns,
                notes: data.notes
            });
        }
        return Store.add('skinProfiles', {
            customerId: data.customerId,
            skinType: data.skinType,
            sensitivity: data.sensitivity || 3,
            hydration: data.hydration || 3,
            elasticity: data.elasticity || 3,
            concerns: data.concerns || [],
            notes: data.notes || ''
        });
    }

    function calculateScore(customerId, beauticianId) {
        var customer = Store.getById('customers', customerId);
        var beautician = Store.getById('beauticians', beauticianId);
        var skinProfile = Store.query('skinProfiles', function (p) {
            return p.customerId === customerId;
        })[0];

        if (!customer || !beautician) {
            return { total: 0, details: {}, breakdown: {} };
        }

        var scores = {};
        var maxScores = {};

        maxScores.skinTypeMatch = 35;
        scores.skinTypeMatch = 0;
        if (beautician.expertise && beautician.expertise.length > 0) {
            var customerSkin = skinProfile ? skinProfile.skinType : customer.skinType;
            if (customerSkin && customerSkin !== 'unknown') {
                if (beautician.expertise.indexOf(customerSkin) >= 0) {
                    scores.skinTypeMatch = 35;
                } else {
                    scores.skinTypeMatch = 10;
                }
            } else {
                scores.skinTypeMatch = 15;
            }
        } else {
            scores.skinTypeMatch = 15;
        }

        maxScores.specialtyMatch = 30;
        scores.specialtyMatch = 0;
        if (skinProfile && skinProfile.concerns && skinProfile.concerns.length > 0 && beautician.specialties && beautician.specialties.length > 0) {
            var matchedConcerns = 0;
            var concernSpecMap = {
                '缺水干燥': '补水保湿', '毛孔粗大': '深层清洁', '色斑暗沉': '美白',
                '细纹松弛': '抗衰老', '敏感泛红': '敏感肌修复', '痘痘粉刺': '深层清洁',
                '出油旺盛': '深层清洁', '肤质粗糙': '面部护理', '黑眼圈': '眼部护理',
                '颈部细纹': '颈部护理'
            };
            skinProfile.concerns.forEach(function (concern) {
                var relatedSpec = concernSpecMap[concern];
                if (relatedSpec && beautician.specialties.indexOf(relatedSpec) >= 0) {
                    matchedConcerns++;
                }
            });
            var matchRatio = matchedConcerns / Math.max(skinProfile.concerns.length, 1);
            var bonus = 0;
            if (beautician.specialties.indexOf('面部护理') >= 0 && matchRatio > 0) {
                bonus += 0.1;
            }
            if (beautician.specialties.indexOf('芳香疗法') >= 0 && skinProfile.concerns.indexOf('敏感泛红') >= 0) {
                bonus += 0.05;
            }
            var ratio = Math.min(matchRatio + bonus, 1);
            scores.specialtyMatch = Math.round(ratio * 30);
        } else {
            scores.specialtyMatch = 10;
        }

        maxScores.skinCondition = 20;
        scores.skinCondition = 10;
        if (skinProfile) {
            var condScore = 0;
            condScore += (6 - skinProfile.sensitivity) * 3;
            condScore += (skinProfile.hydration >= 3 ? 4 : 2);
            condScore += (skinProfile.elasticity >= 3 ? 4 : 2);
            scores.skinCondition = Math.min(condScore, 20);
        }

        maxScores.historyScore = 15;
        scores.historyScore = 0;
        var historyAppts = Store.query('appointments', function (a) {
            return a.customerId === customerId &&
                a.beauticianId === beauticianId &&
                a.status === 'booked';
        });
        if (historyAppts.length > 0) {
            scores.historyScore = Math.min(historyAppts.length * 5, 15);
        } else {
            scores.historyScore = 5;
        }

        var total = 0;
        for (var key in scores) {
            total += scores[key];
        }

        return {
            total: total,
            details: scores,
            maxScores: maxScores,
            breakdown: {
                skinTypeMatch: scores.skinTypeMatch + '/' + maxScores.skinTypeMatch,
                specialtyMatch: scores.specialtyMatch + '/' + maxScores.specialtyMatch,
                skinCondition: scores.skinCondition + '/' + maxScores.skinCondition,
                historyScore: scores.historyScore + '/' + maxScores.historyScore
            }
        };
    }

    function calculateAllAffinities() {
        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');
        var results = [];

        customers.forEach(function (customer) {
            beauticians.forEach(function (beautician) {
                var score = calculateScore(customer.id, beautician.id);
                results.push({
                    customerId: customer.id,
                    beauticianId: beautician.id,
                    totalScore: score.total,
                    details: score.details,
                    breakdown: score.breakdown
                });
            });
        });

        results.sort(function (a, b) { return b.totalScore - a.totalScore; });

        Store.replaceAll('affinityScores', results.map(function (r, idx) {
            r.id = r.customerId + '_' + r.beauticianId;
            r.rank = idx + 1;
            return r;
        }));

        return results;
    }

    function getTopMatches(customerId, limit) {
        var scores = Store.query('affinityScores', function (s) {
            return s.customerId === customerId;
        });
        scores.sort(function (a, b) { return b.totalScore - a.totalScore; });
        return scores.slice(0, limit || 5);
    }

    function renderSkinProfiles() {
        var container = document.getElementById('skin-profiles');
        if (!container) return;

        var profiles = Store.getAll('skinProfiles');
        var customers = Store.getAll('customers');

        if (profiles.length === 0) {
            container.innerHTML = '<div class="empty-hint">暂无肤质档案，请点击"建立肤质档案"</div>';
            return;
        }

        container.innerHTML = profiles.map(function (p) {
            var customer = customers.find(function (c) { return c.id === p.customerId; });
            var concernStr = (p.concerns && p.concerns.length > 0) ? p.concerns.join('、') : '无';
            var sensBars = renderIndicatorBars(p.sensitivity, 5, 'sens');
            var hydraBars = renderIndicatorBars(p.hydration, 5, 'hydra');
            var elastBars = renderIndicatorBars(p.elasticity, 5, 'elast');

            return '<div class="list-item skin-profile-item" data-id="' + p.id + '">' +
                '<div class="item-main">' +
                '<div class="profile-avatar">' + (customer ? customer.name.charAt(0) : '?') + '</div>' +
                '<div class="item-info">' +
                '<strong>' + (customer ? customer.name : '未知') + '</strong>' +
                '<small class="skin-type-badge">' + getSkinTypeLabel(p.skinType) + '</small>' +
                '<div class="profile-indicators">' +
                '<div class="indicator-row"><span class="indicator-label">敏感度</span>' + sensBars + '</div>' +
                '<div class="indicator-row"><span class="indicator-label">水润度</span>' + hydraBars + '</div>' +
                '<div class="indicator-row"><span class="indicator-label">弹性度</span>' + elastBars + '</div>' +
                '</div>' +
                '<small class="concerns-list">关注: ' + concernStr + '</small>' +
                '</div>' +
                '</div>' +
                '<div class="item-actions">' +
                '<button class="btn-icon btn-edit" data-action="edit-skin-profile" data-id="' + p.id + '" title="编辑">✏️</button>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function renderIndicatorBars(value, max, prefix) {
        var html = '<div class="indicator-bars">';
        for (var i = 1; i <= max; i++) {
            var filled = i <= value ? 'filled' : '';
            html += '<span class="bar-dot ' + filled + ' ' + prefix + '-' + i + '"></span>';
        }
        html += '</div>';
        return html;
    }

    function populateCustomerFilter() {
        var filterSelect = document.getElementById('affinity-customer-filter');
        if (!filterSelect) return;

        var customers = Store.getAll('customers');
        var currentValue = filterSelect.value;

        var options = '<option value="">全部顾客</option>' +
            customers.map(function (c) {
                return '<option value="' + c.id + '">' + c.name + '</option>';
            }).join('');

        filterSelect.innerHTML = options;
        if (currentValue) filterSelect.value = currentValue;
    }

    function renderAffinityRanking() {
        populateCustomerFilter();

        var container = document.getElementById('affinity-ranking');
        if (!container) return;

        var filterSelect = document.getElementById('affinity-customer-filter');
        var filterCustomerId = filterSelect ? filterSelect.value : '';

        var scores = Store.getAll('affinityScores');
        var customers = Store.getAll('customers');
        var beauticians = Store.getAll('beauticians');

        if (scores.length === 0) {
            container.innerHTML = '<div class="empty-hint">请先点击"计算契合度"生成排行</div>';
            return;
        }

        if (filterCustomerId) {
            scores = scores.filter(function (s) { return s.customerId === filterCustomerId; });
        }

        scores.sort(function (a, b) { return b.totalScore - a.totalScore; });

        if (scores.length === 0) {
            container.innerHTML = '<div class="empty-hint">该顾客暂无契合度排行数据</div>';
            return;
        }

        container.innerHTML = scores.map(function (s, idx) {
            var customer = customers.find(function (c) { return c.id === s.customerId; });
            var beautician = beauticians.find(function (b) { return b.id === s.beauticianId; });
            var rank = idx + 1;
            var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank;
            var scoreClass = s.totalScore >= 80 ? 'score-excellent' : s.totalScore >= 60 ? 'score-good' : s.totalScore >= 40 ? 'score-fair' : 'score-low';

            var breakdownHtml = '';
            if (s.breakdown) {
                breakdownHtml = '<div class="score-breakdown">' +
                    '<span class="breakdown-item">肤质匹配 ' + s.breakdown.skinTypeMatch + '</span>' +
                    '<span class="breakdown-item">专长匹配 ' + s.breakdown.specialtyMatch + '</span>' +
                    '<span class="breakdown-item">肤况评估 ' + s.breakdown.skinCondition + '</span>' +
                    '<span class="breakdown-item">历史评分 ' + s.breakdown.historyScore + '</span>' +
                    '</div>';
            }

            return '<div class="ranking-item" data-customer="' + s.customerId + '" data-beautician="' + s.beauticianId + '">' +
                '<div class="rank-badge">' + medal + '</div>' +
                '<div class="rank-avatars">' +
                '<span class="avatar customer-avatar">' + (customer ? customer.name.charAt(0) : '?') + '</span>' +
                '<span class="rank-link">⟷</span>' +
                '<span class="avatar beautician-avatar">' + (beautician ? beautician.name.charAt(0) : '?') + '</span>' +
                '</div>' +
                '<div class="rank-info">' +
                '<strong>' + (customer ? customer.name : '未知') + ' ↔ ' + (beautician ? beautician.name : '未知') + '</strong>' +
                breakdownHtml +
                '</div>' +
                '<div class="rank-score ' + scoreClass + '">' + s.totalScore + '</div>' +
                '<div class="rank-actions">' +
                '<button class="btn btn-sm btn-primary" data-action="create-appointment-from-ranking" data-customer="' + s.customerId + '" data-beautician="' + s.beauticianId + '" title="去预约">📅 预约</button>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function showSkinProfileForm(profile) {
        var isEdit = !!profile;
        var customers = Store.getAll('customers');

        if (customers.length === 0) { App.showToast('请先登记顾客', 'warning'); return; }

        var selectedCustomerId = isEdit ? profile.customerId : '';
        var customerOptions = customers.map(function (c) {
            var sel = c.id === selectedCustomerId ? 'selected' : '';
            if (!isEdit) {
                var hasProfile = Store.query('skinProfiles', function (p) { return p.customerId === c.id; });
                if (hasProfile.length > 0) sel = 'disabled';
            }
            return '<option value="' + c.id + '" ' + sel + '>' + c.name + '</option>';
        }).join('');

        var skinTypeOptions = Object.keys(SKIN_TYPE_MAP).map(function (k) {
            var sel = isEdit && profile.skinType === k ? 'selected' : '';
            return '<option value="' + k + '" ' + sel + '>' + SKIN_TYPE_MAP[k] + '</option>';
        }).join('');

        var concernChecks = CONCERN_LIST.map(function (c) {
            var checked = isEdit && profile.concerns && profile.concerns.indexOf(c) >= 0 ? 'checked' : '';
            return '<label class="checkbox-label"><input type="checkbox" name="concern" value="' + c + '" ' + checked + '> ' + c + '</label>';
        }).join('');

        var html = '<form id="skin-profile-form">' +
            '<div class="form-group">' +
            '<label>选择顾客 <span class="required">*</span></label>' +
            '<select id="sp-customer" class="form-input" ' + (isEdit ? 'disabled' : '') + '>' + customerOptions + '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>肤质类型 <span class="required">*</span></label>' +
            '<select id="sp-skin-type" class="form-input">' + skinTypeOptions + '</select>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group">' +
            '<label>敏感度 (1-5)</label>' +
            '<input type="range" id="sp-sensitivity" class="form-range" min="1" max="5" value="' + (isEdit ? profile.sensitivity : 3) + '">' +
            '<div class="range-labels"><span>低</span><span>高</span></div>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>水润度 (1-5)</label>' +
            '<input type="range" id="sp-hydration" class="form-range" min="1" max="5" value="' + (isEdit ? profile.hydration : 3) + '">' +
            '<div class="range-labels"><span>低</span><span>高</span></div>' +
            '</div>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>弹性度 (1-5)</label>' +
            '<input type="range" id="sp-elasticity" class="form-range" min="1" max="5" value="' + (isEdit ? profile.elasticity : 3) + '">' +
            '<div class="range-labels"><span>低</span><span>高</span></div>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>肌肤关注点</label>' +
            '<div class="checkbox-group concern-grid">' + concernChecks + '</div>' +
            '</div>' +
            '<div class="form-group">' +
            '<label>备注</label>' +
            '<textarea id="sp-notes" class="form-input" rows="2">' + (isEdit ? (profile.notes || '') : '') + '</textarea>' +
            '</div>' +
            '</form>';

        var footerHtml = '<button class="btn btn-primary" id="btn-save-profile">保存档案</button>' +
            '<button class="btn btn-outline" id="btn-cancel-modal">取消</button>';

        App.showModal(isEdit ? '编辑肤质档案' : '建立肤质档案', html, footerHtml);

        setTimeout(function () {
            var saveBtn = document.getElementById('btn-save-profile');
            if (saveBtn) {
                saveBtn.onclick = function () {
                    var customerId = document.getElementById('sp-customer').value;
                    if (!customerId) { App.showToast('请选择顾客', 'error'); return; }
                    var skinType = document.getElementById('sp-skin-type').value;
                    var sensitivity = parseInt(document.getElementById('sp-sensitivity').value);
                    var hydration = parseInt(document.getElementById('sp-hydration').value);
                    var elasticity = parseInt(document.getElementById('sp-elasticity').value);
                    var concerns = [];
                    document.querySelectorAll('input[name="concern"]:checked').forEach(function (cb) {
                        concerns.push(cb.value);
                    });
                    var notes = document.getElementById('sp-notes').value.trim();

                    var result = createSkinProfile({
                        customerId: customerId,
                        skinType: skinType,
                        sensitivity: sensitivity,
                        hydration: hydration,
                        elasticity: elasticity,
                        concerns: concerns,
                        notes: notes
                    });

                    if (result) {
                        Store.update('customers', customerId, { skinType: skinType });
                        App.hideModal();
                        App.showToast('肤质档案保存成功', 'success');
                        refresh();
                    }
                };
            }
            document.getElementById('btn-cancel-modal').onclick = App.hideModal;
        }, 100);
    }

    function bindFilterEvents() {
        var filterSelect = document.getElementById('affinity-customer-filter');
        if (filterSelect && !filterSelect._bound) {
            filterSelect._bound = true;
            filterSelect.addEventListener('change', function () {
                renderAffinityRanking();
            });
        }
    }

    function refresh() {
        renderSkinProfiles();
        renderAffinityRanking();
        bindFilterEvents();
    }

    return {
        getSkinTypeLabel: getSkinTypeLabel,
        getConcernList: getConcernList,
        createSkinProfile: createSkinProfile,
        calculateScore: calculateScore,
        calculateAllAffinities: calculateAllAffinities,
        getTopMatches: getTopMatches,
        renderSkinProfiles: renderSkinProfiles,
        renderAffinityRanking: renderAffinityRanking,
        showSkinProfileForm: showSkinProfileForm,
        refresh: refresh
    };
})();

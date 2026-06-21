var Store = (function () {
    var DB_KEY = 'beauty_salon_db';
    var BACKUP_KEY = 'beauty_salon_backups';
    var SETTINGS_KEY = 'beauty_salon_settings';
    var FILE_MAGIC = 'BEAUTY_SALON_V1';
    var MAX_AUTO_BACKUPS = 10;

    var defaultData = {
        beds: [],
        customers: [],
        beauticians: [],
        appointments: [],
        intentions: [],
        skinProfiles: [],
        conflicts: [],
        releasedSlots: [],
        matches: [],
        affinityScores: []
    };

    var defaultSettings = {
        lastAutoBackupDate: null,
        backups: []
    };

    function _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function _load() {
        try {
            var raw = localStorage.getItem(DB_KEY);
            if (raw) {
                var data = JSON.parse(raw);
                for (var key in defaultData) {
                    if (!data[key]) data[key] = [];
                }
                return data;
            }
        } catch (e) {
            console.error('Store load error:', e);
        }
        return JSON.parse(JSON.stringify(defaultData));
    }

    function _save(data) {
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Store save error:', e);
            return false;
        }
    }

    function _loadSettings() {
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return JSON.parse(JSON.stringify(defaultSettings));
    }

    function _saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Settings save error:', e);
            return false;
        }
    }

    function validateBackupData(data) {
        var errors = [];

        if (!data || typeof data !== 'object') {
            return { valid: false, errors: ['数据不是有效的 JSON 对象'] };
        }

        for (var key in defaultData) {
            if (!data.hasOwnProperty(key)) {
                errors.push('缺少必需字段: ' + key);
            } else if (!Array.isArray(data[key])) {
                errors.push('字段格式错误: ' + key + ' 应该是数组');
            }
        }

        if (data.beds && Array.isArray(data.beds)) {
            data.beds.forEach(function (b, idx) {
                if (!b.id) errors.push('美容床 #' + (idx + 1) + ' 缺少 id');
                if (!b.name) errors.push('美容床 #' + (idx + 1) + ' 缺少名称');
            });
        }

        if (data.appointments && Array.isArray(data.appointments)) {
            data.appointments.forEach(function (a, idx) {
                if (!a.id) errors.push('预约 #' + (idx + 1) + ' 缺少 id');
                if (!a.customerId) errors.push('预约 #' + (idx + 1) + ' 缺少顾客');
                if (!a.bedId) errors.push('预约 #' + (idx + 1) + ' 缺少美容床');
                if (!a.date) errors.push('预约 #' + (idx + 1) + ' 缺少日期');
                if (a.startTime === undefined || a.endTime === undefined) {
                    errors.push('预约 #' + (idx + 1) + ' 缺少时段');
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    function getAll(collection) {
        return _load()[collection] || [];
    }

    function getById(collection, id) {
        var items = getAll(collection);
        return items.find(function (item) { return item.id === id; }) || null;
    }

    function add(collection, item) {
        var data = _load();
        item.id = _generateId();
        item.createdAt = new Date().toISOString();
        data[collection].push(item);
        _save(data);
        return item;
    }

    function update(collection, id, updates) {
        var data = _load();
        var idx = data[collection].findIndex(function (item) { return item.id === id; });
        if (idx === -1) return null;
        Object.assign(data[collection][idx], updates);
        data[collection][idx].updatedAt = new Date().toISOString();
        _save(data);
        return data[collection][idx];
    }

    function remove(collection, id) {
        var data = _load();
        data[collection] = data[collection].filter(function (item) { return item.id !== id; });
        _save(data);
    }

    function query(collection, predicate) {
        return getAll(collection).filter(predicate);
    }

    function count(collection, predicate) {
        if (!predicate) return getAll(collection).length;
        return query(collection, predicate).length;
    }

    function replaceAll(collection, items) {
        var data = _load();
        data[collection] = items;
        _save(data);
    }

    function clearAll() {
        return _save(JSON.parse(JSON.stringify(defaultData)));
    }

    function exportData() {
        var data = _load();
        var wrapper = {
            magic: FILE_MAGIC,
            version: 1,
            exportedAt: new Date().toISOString(),
            data: data
        };
        return JSON.stringify(wrapper, null, 2);
    }

    function importData(jsonStr) {
        try {
            var wrapper = JSON.parse(jsonStr);

            if (wrapper.magic !== FILE_MAGIC) {
                return {
                    success: false,
                    code: 'INVALID_FILE',
                    message: '这不是系统导出的备份文件，请选择正确的备份文件（以 "美容院数据备份_" 开头的 JSON 文件）'
                };
            }

            if (wrapper.version !== 1) {
                return {
                    success: false,
                    code: 'WRONG_VERSION',
                    message: '备份文件版本不兼容（文件版本: v' + wrapper.version + '，系统版本: v1）'
                };
            }

            if (!wrapper.data) {
                return {
                    success: false,
                    code: 'NO_DATA',
                    message: '备份文件不包含数据内容，可能已损坏'
                };
            }

            var validation = validateBackupData(wrapper.data);
            if (!validation.valid) {
                return {
                    success: false,
                    code: 'VALIDATION_FAILED',
                    message: '数据完整性校验失败，发现 ' + validation.errors.length + ' 处问题',
                    errors: validation.errors
                };
            }

            var saveResult = _save(wrapper.data);
            if (!saveResult) {
                return {
                    success: false,
                    code: 'SAVE_FAILED',
                    message: '写入数据时失败，可能是存储空间不足'
                };
            }

            return {
                success: true,
                code: 'OK',
                message: '数据导入成功',
                exportedAt: wrapper.exportedAt
            };
        } catch (e) {
            if (e instanceof SyntaxError) {
                return {
                    success: false,
                    code: 'INVALID_JSON',
                    message: '文件格式错误，不是有效的 JSON 文件',
                    error: e.message
                };
            }
            return {
                success: false,
                code: 'UNKNOWN_ERROR',
                message: '导入失败: ' + e.message
            };
        }
    }

    function createAutoBackup(reason) {
        try {
            var data = exportData();
            var timestamp = new Date().toISOString();
            var backupId = _generateId();
            var size = new Blob([data]).size;

            var settings = _loadSettings();
            settings.backups.unshift({
                id: backupId,
                timestamp: timestamp,
                size: size,
                reason: reason || 'auto',
                data: data
            });

            if (settings.backups.length > MAX_AUTO_BACKUPS) {
                settings.backups = settings.backups.slice(0, MAX_AUTO_BACKUPS);
            }

            _saveSettings(settings);

            return {
                id: backupId,
                timestamp: timestamp,
                size: size
            };
        } catch (e) {
            console.error('Auto backup failed:', e);
            return null;
        }
    }

    function getAutoBackups() {
        var settings = _loadSettings();
        return settings.backups.map(function (b) {
            return {
                id: b.id,
                timestamp: b.timestamp,
                size: b.size,
                reason: b.reason,
                hasData: !!b.data
            };
        });
    }

    function restoreAutoBackup(backupId) {
        var settings = _loadSettings();
        var backup = settings.backups.find(function (b) { return b.id === backupId; });

        if (!backup) {
            return { success: false, message: '未找到该备份记录' };
        }

        if (!backup.data) {
            return { success: false, message: '备份数据已丢失，无法恢复' };
        }

        var result = importData(backup.data);
        return result;
    }

    function deleteAutoBackup(backupId) {
        var settings = _loadSettings();
        settings.backups = settings.backups.filter(function (b) { return b.id !== backupId; });
        _saveSettings(settings);
        return true;
    }

    function checkShouldAutoBackup() {
        var settings = _loadSettings();
        var today = new Date().toISOString().split('T')[0];

        if (settings.lastAutoBackupDate !== today) {
            settings.lastAutoBackupDate = today;
            _saveSettings(settings);
            return { shouldBackup: true, reason: 'daily', date: today };
        }
        return { shouldBackup: false };
    }

    function markTodayBackupDone() {
        var settings = _loadSettings();
        settings.lastAutoBackupDate = new Date().toISOString().split('T')[0];
        _saveSettings(settings);
    }

    function getBackupStats() {
        var settings = _loadSettings();
        var totalSize = 0;
        settings.backups.forEach(function (b) { totalSize += b.size || 0; });
        return {
            count: settings.backups.length,
            maxCount: MAX_AUTO_BACKUPS,
            totalSize: totalSize,
            lastBackupDate: settings.lastAutoBackupDate
        };
    }

    return {
        getAll: getAll,
        getById: getById,
        add: add,
        update: update,
        remove: remove,
        query: query,
        count: count,
        replaceAll: replaceAll,
        clearAll: clearAll,
        importData: importData,
        exportData: exportData,
        validateBackupData: validateBackupData,
        generateId: _generateId,
        createAutoBackup: createAutoBackup,
        getAutoBackups: getAutoBackups,
        restoreAutoBackup: restoreAutoBackup,
        deleteAutoBackup: deleteAutoBackup,
        checkShouldAutoBackup: checkShouldAutoBackup,
        markTodayBackupDone: markTodayBackupDone,
        getBackupStats: getBackupStats,
        MAGIC: FILE_MAGIC,
        MAX_AUTO_BACKUPS: MAX_AUTO_BACKUPS
    };
})();

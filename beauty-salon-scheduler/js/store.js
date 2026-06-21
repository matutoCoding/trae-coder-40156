var Store = (function () {
    var DB_KEY = 'beauty_salon_db';

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
        } catch (e) {
            console.error('Store save error:', e);
        }
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
        _save(JSON.parse(JSON.stringify(defaultData)));
    }

    function importData(jsonStr) {
        try {
            var data = JSON.parse(jsonStr);
            _save(data);
            return true;
        } catch (e) {
            return false;
        }
    }

    function exportData() {
        return JSON.stringify(_load(), null, 2);
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
        generateId: _generateId
    };
})();

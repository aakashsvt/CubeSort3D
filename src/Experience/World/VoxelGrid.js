export default class VoxelGrid {
    constructor() {
        this.grid = new Map()
    }

    _getKey(x, y, z) {
        return `${x},${y},${z}`
    }

    set(x, y, z, cubeData) {
        this.grid.set(this._getKey(x, y, z), cubeData)
    }

    get(x, y, z) {
        return this.grid.get(this._getKey(x, y, z))
    }

    remove(x, y, z) {
        this.grid.delete(this._getKey(x, y, z))
    }

    has(x, y, z) {
        return this.grid.has(this._getKey(x, y, z))
    }

    clear() {
        this.grid.clear()
    }
}

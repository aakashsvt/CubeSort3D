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

    collectSmallAttachedIslands(maxIslandSize = 8) {
        const result = []
        if (maxIslandSize <= 0 || this.grid.size === 0) return result

        const visited = new Set()
        const directions = []
        for(let dx=-1; dx<=1; dx++) {
            for(let dy=-1; dy<=1; dy++) {
                for(let dz=-1; dz<=1; dz++) {
                    if(dx===0 && dy===0 && dz===0) continue;
                    directions.push({dx, dy, dz})
                }
            }
        }

        for (const [key, startCube] of this.grid.entries()) {
            if (visited.has(key)) continue

            const component = []
            const queue = [startCube]
            visited.add(key)

            while (queue.length > 0) {
                const current = queue.shift()
                component.push(current)

                for (const dir of directions) {
                    const nx = current.gridPos.x + dir.dx
                    const ny = current.gridPos.y + dir.dy
                    const nz = current.gridPos.z + dir.dz

                    const neighborKey = this._getKey(nx, ny, nz)
                    if (visited.has(neighborKey)) continue

                    const neighbor = this.grid.get(neighborKey)
                    if (neighbor) {
                        visited.add(neighborKey)
                        queue.push(neighbor)
                    }
                }
            }

            if (component.length > 0 && component.length <= maxIslandSize) {
                result.push(...component)
            }
        }

        return result
    }
}

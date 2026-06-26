export default class FloodFillSelector {
    constructor(voxelGrid) {
        this.grid = voxelGrid
    }

    getConnectedGroup(startX, startY, startZ) {
        const startCube = this.grid.get(startX, startY, startZ)
        if (!startCube) return []

        const colorIndex = startCube.colorIndex
        const connected = []
        const visited = new Set()
        const queue = [startCube]

        visited.add(this.grid._getKey(startX, startY, startZ))

        const directions = [
            { dx: 1, dy: 0, dz: 0 },
            { dx: -1, dy: 0, dz: 0 },
            { dx: 0, dy: 1, dz: 0 },
            { dx: 0, dy: -1, dz: 0 },
            { dx: 0, dy: 0, dz: 1 },
            { dx: 0, dy: 0, dz: -1 }
        ]

        while (queue.length > 0) {
            const current = queue.shift()
            connected.push(current)

            for (const dir of directions) {
                const nx = current.gridPos.x + dir.dx
                const ny = current.gridPos.y + dir.dy
                const nz = current.gridPos.z + dir.dz

                const neighborKey = this.grid._getKey(nx, ny, nz)
                if (visited.has(neighborKey)) continue

                const neighbor = this.grid.get(nx, ny, nz)
                if (neighbor && neighbor.colorIndex === colorIndex) {
                    visited.add(neighborKey)
                    queue.push(neighbor)
                }
            }
        }

        return connected
    }
}

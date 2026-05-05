/**
 * Split an image into a grid using Canvas API.
 * @param {string} dataUrl - Source image as data URL
 * @param {'2x2'|'3x3'|'4x4'|'1x3'|'3x1'} grid - Grid layout
 * @returns {Promise<Array<{dataUrl: string, row: number, col: number}>>}
 */
export function splitImage(dataUrl, grid = '3x3') {
  return new Promise((resolve, reject) => {
    const [rows, cols] = grid.split('x').map(Number)
    if (!rows || !cols || rows < 1 || cols < 1) {
      reject(new Error('无效网格格式'))
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const cellW = Math.floor(img.width / cols)
      const cellH = Math.floor(img.height / rows)
      if (cellW < 1 || cellH < 1) {
        reject(new Error('图片太小，无法拆分'))
        return
      }

      const results = []
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const canvas = document.createElement('canvas')
          canvas.width = cellW
          canvas.height = cellH
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH)
          results.push({
            dataUrl: canvas.toDataURL('image/png'),
            row,
            col,
            label: `${row + 1}-${col + 1}`
          })
        }
      }
      resolve(results)
    }

    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = dataUrl
  })
}

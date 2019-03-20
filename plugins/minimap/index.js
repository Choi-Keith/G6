const G = require('@antv/g/lib');
const Base = require('../base');
const isString = require('@antv/util/lib/type/is-string');
const isNil = require('@antv/util/lib/type/is-nil');
const createDOM = require('@antv/util/lib/dom/create-dom');
const modifyCSS = require('@antv/util/lib/dom/modify-css');
const each = require('@antv/util/lib/each');

const max = Math.max;

class Minimap extends Base {
  init(graph) {
    super.init(graph);
    this.initContainer();
  }
  getDefaultCfg() {
    return {
      container: null,
      className: 'g6-minimap',
      viewportClassName: 'g6-minimap-viewport',
      keyShapeOnly: false,
      viewportStyle: {
        stroke: '#1890ff',
        lineWidth: 2,
        x: 0,
        y: 0,
        width: 200,
        height: 120
      },
      size: [ 200, 120 ]
    };
  }
  getEvents() {
    return { beforepaint: 'updateCanvas' };
  }
  initContainer() {
    const self = this;
    const graph = self.get('graph');
    const size = self.get('size');
    const className = self.get('className');
    let container = self.get('container');
    if (isString(container)) {
      container = document.getElementById(container);
    }
    if (container) {
      container.classList.add(className);
      modifyCSS(container, {
        width: size[0] + 'px',
        height: size[1] + 'px'
      });
    } else {
      container = createDOM('<div class="' + className + '" style="width:' + size[0] + 'px; height:' + size[1] + 'px"></div>');
      graph.get('container').appendChild(container);
    }
    self.set('container', container);
    const containerDOM = createDOM('<div class="g6-minimap-container"></div>');
    container.appendChild(containerDOM);
    const canvas = new G.Canvas({
      containerDOM,
      width: size[0],
      height: size[1],
      pixelRatio: graph.get('pixelRatio')
    });
    self.set('canvas', canvas);
    self.updateCanvas();
  }
  initViewport() {
    const cfgs = this._cfgs;
    const size = cfgs.size;
    const graph = cfgs.graph;
    const pixelRatio = graph.get('pixelRatio') || graph.get('canvas').get('pixelRatio');
    const widthRatio = graph.get('width') / size[0] * pixelRatio;
    const heightRatio = graph.get('height') / size[1] * pixelRatio;
    const canvas = this.get('canvas');
    const containerDOM = canvas.get('containerDOM');
    const viewport = createDOM('<div class="' + cfgs.viewportClassName + '" style="position:absolute;left:0;top:0;box-sizing:border-box;border: 2px solid #1980ff"></div>');
    let x,            // 计算拖拽水平方向距离
      y,              // 计算拖拽垂直方向距离
      dragging,       // 是否在拖拽minimap的视口
      left,           // 缓存viewport当前对于画布的x
      top,            // 缓存viewport当前对于画布的y
      width,          // 缓存viewport当前宽度
      height;         // 缓存viewport当前高度
    containerDOM.addEventListener('mousedown', e => {
      if (e.target !== viewport) {
        return;
      }
      // 如果视口已经最大了，不需要拖拽
      const style = viewport.style;
      left = parseInt(style.left, 10);
      top = parseInt(style.top, 10);
      width = parseInt(style.width, 10);
      height = parseInt(style.height, 10);
      if (width >= size[0] || height >= size[1]) {
        return;
      }
      dragging = true;
      x = e.clientX;
      y = e.clientY;
    }, false);
    containerDOM.addEventListener('mousemove', e => {
      if (!dragging || isNil(e.clientX) || isNil(e.clientY)) {
        return;
      }
      let dx = x - e.clientX;
      let dy = y - e.clientY;
      // 若视口移动到最左边或最右边了,仅移动到边界
      if (left - dx < 0) {
        dx = left;
      } else if (left - dx + width > size[0]) {
        dx = left + width - size[0];
      }
      // 若视口移动到最上或最下边了，仅移动到边界
      if (top - dy < 0) {
        dy = top;
      } else if (top - dy + height > size[1]) {
        dy = top + height - size[1];
      }
      left -= dx;
      top -= dy;
      // 先移动视口，避免移动到边上以后出现视口闪烁
      modifyCSS(viewport, {
        left: left + 'px',
        top: top + 'px'
      });
      graph.translate(dx * widthRatio, dy * heightRatio);
      x = e.clientX;
      y = e.clientY;
    }, false);
    containerDOM.addEventListener('mouseleave', () => {
      dragging = false;
    }, false);
    containerDOM.addEventListener('mouseup', () => {
      dragging = false;
    }, false);
    this.set('viewport', viewport);
    containerDOM.appendChild(viewport);
  }
  updateCanvas() {
    const size = this.get('size');
    const graph = this.get('graph');
    const canvas = this.get('canvas');
    // 根据cfgs更新画布内容
    if (this.get('keyShapeOnly')) {
      this._updateKeyShapes();
    } else {
      this._updateGraphShapes();
    }
    // 更新minimap视口
    this._updateViewport();
    // 刷新后bbox可能会变，需要重置画布矩阵以缩放到合适的大小
    const bbox = canvas.getBBox();
    const width = max(bbox.width, graph.get('width'));
    const height = max(bbox.height, graph.get('height'));
    const pixelRatio = canvas.get('pixelRatio');
    canvas.resetMatrix();
    canvas.scale(size[0] / width * pixelRatio, size[1] / height * pixelRatio);
    canvas.draw();
  }
  // 仅在minimap上绘制keyShape
  // FIXME 如果用户自定义绘制了其他内容，minimap上就无法画出
  _updateKeyShapes() {
    const graph = this._cfgs.graph;
    const canvas = this.get('canvas');
    const group = canvas.get('children')[0] || canvas.addGroup();
    const nodes = graph.getNodes();
    const edges = graph.getEdges();
    group.clear();
    // 边可以直接使用keyShape
    each(edges, edge => {
      group.add(edge.get('keyShape').clone());
    });
    // 节点需要group配合keyShape
    each(nodes, node => {
      const parent = group.addGroup();
      parent.setMatrix(node.get('group').attr('matrix'));
      parent.add(node.get('keyShape').clone());
    });
  }
  // 将主图上的图形完全复制到小图
  _updateGraphShapes() {
    const cfgs = this._cfgs;
    const graph = cfgs.graph;
    const canvas = this.get('canvas');
    const graphGroup = graph.get('group');
    const clonedGroup = graphGroup.clone();
    clonedGroup.resetMatrix();
    canvas.get('children')[0] = clonedGroup;
  }
  // 绘制minimap视口
  _updateViewport() {
    const size = this._cfgs.size;
    const graph = this._cfgs.graph;
    const matrix = graph.get('group').getMatrix();
    const topLeft = graph.getPointByCanvas(0, 0);
    const viewport = this.get('viewport');
    if (!viewport) {
      this.initViewport();
    }
    // viewport宽高,左上角点的计算
    const width = matrix[0] >= 1 ? size[0] / matrix[0] : size[0];
    const height = matrix[4] >= 1 ? size[1] / matrix[4] : size[1];
    const left = topLeft.x > 0 ? topLeft.x * size[0] / graph.get('width') : 0;
    const top = topLeft.y > 0 ? topLeft.y * size[1] / graph.get('height') : 0;
    modifyCSS(viewport, {
      left: left + 'px',
      top: top + 'px',
      width: width + 'px',
      height: height + 'px'
    });
  }

  /**
   * 获取minimap的画布
   * @return {object} G的canvas实例
   */
  getCanvas() {
    return this.get('canvas');
  }
  /**
   * 获取minimap的窗口
   * @return {object} 窗口的dom实例
   */
  getViewport() {
    return this.get('viewport');
  }
  /**
   * 获取minimap的容器dom
   * @return {object} dom
   */
  getContainer() {
    return this.get('container');
  }
  destroy() {
    const container = this.get('canvas');
    this.get('canvas').destroy();
    container.innerHTML = '';
    super.destroy();
  }
}

module.exports = Minimap;

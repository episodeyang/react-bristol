import React, {Component, PropTypes} from 'react';
import autobind from 'autobind-decorator';
import Canvas from './Canvas';
// import DotTest from './extensions/dotTest';
// const pen = DotTest({color: '#003bff'});
// import CalligraphyPen from './extensions/calligraphyPen';
// const pen = CalligraphyPen({color: 'blue', strokeWidth: 10, angle: -45, epsilon: 0.1, blur: 1});

const ALLOWED_MODES = ['png', 'ink'];

const {number, func, bool, object, array, oneOf, any} = PropTypes;
/**
 * description of the component
 */
export default class Bristol extends Component {

  static propTypes = {
    style: object,
    width: number,
    height: number,
    renderRatio: number,
    mode: oneOf(ALLOWED_MODES),
    onChange: func,
    pen: object.isRequired,
    palette: any.isRequired,
    /** todo: use correct type for image */
    data: array,
    image: any,
    backgroundImage: any,
    interpolation: bool
  };

  static defaultProps = {
    renderRatio: 3,
    interpolation: true
  };

  componentWillMount() {
    this._activePaths = {};
    this._paintStack = this.props.data || [];
    this._instantiatePalette(this.props.palette)
  }

  get data() {
    return this._paintStack;
  }

  componentDidMount() {
    this.active = this.refs['active'];
    this.inactive = this.refs['inactive'];
    this._drawPaintStack();
    // this.active.putImage()
  }

  componentWillReceiveProps({pen, palette, data}) {
    if (this.props.palette !== palette) {
      this._instantiatePalette(palette)
    }
    if (data !== this.props.data && data !== this._paintStack) {
      this._paintStack = data;
      this._drawPaintStack()
    }
  }

  _instantiatePalette(palette) {
    this._palette = {};
    Object.keys(palette).forEach(key => {
      this._palette[key] = new palette[key]
    })
  }

  /** gets the image data as a DataURI (zoom is not yet supported) */
  toDataURI(type, options) {
    return this.inactive.toDataURI(type, options);
  }

  /** gets the 2D RGBA image array data. */
  getImage() {
    return this.inactive.getImageData()
  }

  @autobind
  genericHandler(event) {
    event.preventDefault();
    const {type, changedTouches} = event;
    const penConfig = this.props.pen;
    // strokeChange
    if (changedTouches && changedTouches.length >= 1 && typeof changedTouches[0].force !== 'undefined') {
      Array.from(changedTouches)
        .forEach(
          ({identifier, pageX, pageY, force, tilt}) =>
            this._recordTouch({
              eventType: type,
              id: identifier,
              config: penConfig,
              pageX,
              pageY,
              force,
              tilt
            })
        );
    } else if (type.match(/^mouse/)) {
      let {pageX, pageY} = event;
      this._recordTouch({
        eventType: type,
        id: 'mouse',
        config: penConfig,
        pageX,
        pageY
      });
    }
  }


  _recordTouch({eventType, id, config, pageX, pageY, force, tilt}) {
    let x, y;
    switch (eventType) {
      case 'mousedown':
      case 'touchstart':
        ({x, y} = this._getDressedCursorPosition(pageX, pageY, true));
        this._startPath({id, config, x, y, force, tilt});
        this._drawActivePaths();
        break;
      case 'mousemove':
      case 'touchmove':
        if (!this._getActivePath(id)) return;
        ({x, y} = this._getDressedCursorPosition(pageX, pageY));
        this._appendPathPoint({id, config, x, y, force, tilt});
        this._drawActivePaths();
        break;
      case 'mouseup':
      case 'touchend':
        ({x, y} = this._getDressedCursorPosition(pageX, pageY));
        const path = this._completePath({id});
        setTimeout(() => {
          this._drawActivePaths(true);
          this._patchPaintStack(path);
        }, 16);
        break;
    }
  }

  _getDressedCursorPosition(pageX, pageY, refreshOffset = false) {
    if (refreshOffset) this.active.clearPageOffset();
    const {renderRatio} =  this.props;
    const pos = {
      x: (pageX - this.active.pageOffset.left
        - (this.active.pageOffset.width - this.props.width) / 2
      ) * renderRatio,
      y: (pageY - this.active.pageOffset.top
        - (this.active.pageOffset.height - this.props.height) / 2
      ) * renderRatio
    };
    return pos;
  }

  _isPressureSensitive(force) {
    return !!force; // 0 => false, undefined => false, 0.20 => true
  }

  _startPath({id, config, x, y, force, tilt}) {
    let newPath = {
      config,
      data: {
        xs: [],
        ys: [],
        configs: []
      }
    };
    this._activePaths[id] = newPath;
    if (this._isPressureSensitive(force)) {
      newPath.data.forces = [];
      newPath.data.tiltes = [];
      this._appendPathPoint({id, config, x, y, force, tilt});
    } else {
      this._appendPathPoint({id, config, x, y});
    }
  }

  _getActivePath(id) {
    return this._activePaths[id];
  }

  _appendPathPoint({id, config, x, y, force, tilt}) {
    const path = this._getActivePath(id);
    if (!path) return;
    path.data.xs.push(x);
    path.data.ys.push(y);
    path.data.configs.push(config);
    if (config !== path.config) path._configDirty = true;
    if (path.data.forces) {
      path.data.forces.push(force);
      path.data.tilts.push(tilt);
    }
  }

  _compressPath({config, _configDirty, data}) {
    // remove data config field is all config are the same
    if (!_configDirty) delete data.configs;
    return {config, data};
  }

  _completePath({id}) {
    let path = this._compressPath(this._activePaths[id]);
    this._paintStack.push(path);
    delete this._activePaths[id];
    return path;
  }

  draw(context, path, options) {
    this._palette[path.config.type].draw(context, path, options);
  }

  _patchPaintStack(newPath) {
    this.draw(this.inactive.context, newPath);
    const {onChange} = this.props;
    if (onChange) onChange(this._paintStack, newPath);
  }

  _drawPaintStack() {
    this.inactive.clear();
    this._paintStack.forEach(
      (data) => {
        console.log(data);
        this.draw(this.inactive.context, data);
      });
  }

  _drawActivePaths(clearFirst = false) {
    if (clearFirst) this.active.clear();
    for (let key in this._activePaths) {
      const activePath = this._activePaths[key];
      this.draw(this.active.context, activePath, {active: true})
    }
  }

  render() {
    const {width, height, renderRatio, onChange, pen, palette, data, image, backgroundImage, interpolation, scale, offset, style, ..._props} = this.props;
    const canvasStyle = {
      position: 'absolute',
      top: 0, left: 0,
      transform: `scale(${1 / renderRatio}, ${1 / renderRatio})` +
      `translate(${-width * (renderRatio - 1) * renderRatio / 2}px, ${-height * (renderRatio - 1) * renderRatio / 2}px)`,
      ...style
    };
    return (
      <div style={{width, height, position: 'relative', ...style}}>
        <Canvas ref="active"
                style={canvasStyle}
                width={width * renderRatio}
          // always interpolate for otherwise won't show on mobile safari.
                height={height * renderRatio}
                onMouseDown={this.genericHandler}
                onMouseMove={this.genericHandler}
                onMouseUp={this.genericHandler}
                onTouchStart={this.genericHandler}
                onTouchMove={this.genericHandler}
                onTouchEnd={this.genericHandler}
                onTouchCancel={this.genericHandler}
                interpolation={false}
                {..._props}/>
        <Canvas ref="inactive"
                style={{...canvasStyle, zIndex: -1}}
                width={width * renderRatio}
                height={height * renderRatio}
                interpolation={interpolation}
                {..._props}/>
        {backgroundImage ? <Canvas ref="background-image"
                                   style={{...canvasStyle, zIndex: -2}}
                                   width={width * renderRatio}
                                   height={height * renderRatio}
                                   interpolation={interpolation}/> : null}
      </div>
    );
  }
}
import React, { Component } from "react";
import "./BasemapSwitcher.css";
import * as helpers from "../helpers/helpers";
import BasemapConfig from "./basemapSwitcherConfig.json";
import Slider from "rc-slider";
import { Group as LayerGroup } from "ol/layer.js";
import xml2js from "xml2js";

//BLI:Debug
import OlSourceTileWMS from 'ol/source/TileWMS';
import TileLayer from 'ol/layer/Tile';

const img_background_map='img_background_map';
const vector_background_map='vector_background_map';
class BasemapSwitcher extends Component {
  constructor(props) {
    super(props);

    this.state = {
      imagerySliderMarks: this.getImagerySliderMarks(),
      imagerySliderMin: 0,
      imagerySliderMax: BasemapConfig.imageryServices.length - 1,
      imagerySliderDefaultValue: BasemapConfig.imageryServices.length - 1,
      imagerySliderValue: BasemapConfig.imageryServices.length - 1,
      imageryLayers: [],
      imageryPanelOpen: false,
      backgroundLayers:[], //BLI: hold background maps
      streetsLayer: null,
      streetsCheckbox: true,
      containerCollapsed: false,
      topoPanelOpen: false,
      topoLayers: [],
      topoActiveIndex: 0,
      topoCheckbox: true,
      topoOverlayLayers: [],
      activeButton: "imagery"
    };

    // LISTEN FOR MAP TO MOUNT
    if(window.appConfig.TwoBaseMapsOnly) {
      window.emitter.addListener("mapLoaded", () => this.loadBackgroupMap());
    }
    else {
      window.emitter.addListener("mapLoaded", () => this.onMapLoad());
    }
  }

  // CREATE YEAR MARKS ON THE SLIDER
  getImagerySliderMarks() {
    const numServices = BasemapConfig.imageryServices.length;
    if (numServices < 2) return {};

    let marks = {};
    for (let index = 0; index < numServices; index++) {
      marks[index] = BasemapConfig.imageryServices[index].name;
    }
    return marks;
  }
  getOLLayer(array,key) {
    //BLI: the object is "key: value" stored in array, like "vector: osmLayer"
    let layer=null;
    if(array)
    {
      array.forEach(element => {
        if(element.hasOwnProperty(key))
        {
          layer=element[key];
          return;
        }
      });
    }
    return layer;
  }

  setBgMapVisibilty(layerArray,layerKey,visible,index) {
    //used for two background maps mode
    let selectedLayer= this.getOLLayer(layerArray,layerKey);
    if(selectedLayer!==undefined)
    {
      selectedLayer.setVisible(visible);
      selectedLayer.setZIndex(index);
    }
  }

  loadBackgroupMap() {
    let index=0;
    let layerList=[];
    let imageLayer=helpers.getESRITileXYZLayer(window.appConfig.imageryBackground);
    // imagery background LAYER PROPS
    imageLayer.setProperties({ index: index, name: img_background_map });
    imageLayer.setZIndex(index);
    imageLayer.setVisible(true); //turn on as default
    //add the imagery layer to map
    window.map.addLayer(imageLayer);
    layerList.push({img_background_map: imageLayer});
    //OSM background Layer:
    let osmLayer=helpers.getOSMLayer();
    osmLayer.setProperties({name: vector_background_map})
    osmLayer.setZIndex(index);
    osmLayer.setVisible(false);
    window.map.addLayer(osmLayer);
    layerList.push({vector_background_map: osmLayer});
    this.setState({backgroundLayers:layerList});
  }

  onMapLoad() {
    // LOAD IMAGERY LAYERS
    let layerList = [];
    let index = 0;
    BasemapConfig.imageryServices.forEach(service => {
      //var layer = helpers.getArcGISTiledLayer(service.url);
      var layer = helpers.getSimcoeTileXYZLayer(service.url);

      // LAYER PROPS
      layer.setProperties({ index: index, name: service.name });
      layer.setZIndex(index);
      layer.setVisible(false);

      // SET MAIN LAYER VISIBLE
      if (BasemapConfig.imageryServices.length - 1 === index) {
        layer.setVisible(true);
        this.setState({ imagerySliderValue: index });
      }

      // ADD THE LAYER
      window.map.addLayer(layer);
      layerList.push(layer);
      index++;
    });

    this.setState({ imageryLayers: layerList });

    // LOAD IMAGERY STREETS LAYER
    if (BasemapConfig.streetService !== undefined) {
      //var streetsLayer = helpers.getArcGISTiledLayer(BasemapConfig.streetService);
      var streetsLayer = helpers.getSimcoeTileXYZLayer(BasemapConfig.streetService);
      streetsLayer.setZIndex(BasemapConfig.imageryServices.length);
      window.map.addLayer(streetsLayer);
      this.setState({ streetsLayer: streetsLayer });
    }

    // LOAD BATHYMETRY LAYER
    if (BasemapConfig.bathymetryService !== undefined) {
      var bathymetryLayer = helpers.getSimcoeTileXYZLayer(BasemapConfig.bathymetryService);
      bathymetryLayer.setZIndex(0);
      window.map.addLayer(bathymetryLayer);
      this.setState({ bathymetryLayer: bathymetryLayer });
    }

    // LOAD WORLD LAYER
    if (BasemapConfig.worldImageryService !== undefined) {
      var worldImageryLayer = helpers.getESRITileXYZLayer(BasemapConfig.worldImageryService);
      worldImageryLayer.setZIndex(0);
      //worldImageryLayer.setMinResolution(300);
      window.map.addLayer(worldImageryLayer);
      this.setState({ worldImageryLayer: worldImageryLayer });
    }

    // LOAD BASEMAP LAYERS
    let basemapList = [];
    //let basemapIndex = 0;
    BasemapConfig.topoServices.forEach(serviceGroup => {
      index = 0;
      let serviceLayers = [];
      serviceGroup.layers.forEach(service => {
        // CREATE THE LAYER
        let layer = null;
        if (service.type === "SIMCOE_TILED") {
          layer = helpers.getSimcoeTileXYZLayer(service.url);
        } else if (service.type === "OSM") {
          //layer = helpers.getOSMLayer();
          layer = helpers.getOSMTileXYZLayer("http://a.tile.openstreetmap.org");
        } else if (service.type === "ESRI_TILED") {
          layer = helpers.getArcGISTiledLayer(service.url);
        }

        // LAYER PROPS
        layer.setProperties({ index: index, name: service.name, isOverlay: false });
        serviceLayers.push(layer);
        index++;
      });

      const groupUrl = serviceGroup.groupUrl;
      if (groupUrl !== undefined) {
        // GET XML
        helpers.httpGetText(groupUrl, result => {
          var parser = new xml2js.Parser();

          // PARSE TO JSON
          parser.parseString(result, function(err, result) {
            const groupLayerList = result.WMS_Capabilities.Capability[0].Layer[0].Layer[0].Layer;
            index++;
            groupLayerList.forEach(layerInfo => {
              const layerNameOnly = layerInfo.Name[0].split(":")[1];
              const serverUrl = groupUrl.split("/geoserver/")[0] + "/geoserver";

              let groupLayer = helpers.getImageWMSLayer(serverUrl + "/wms", layerInfo.Name[0]);
              groupLayer.setVisible(true);
              groupLayer.setProperties({ index: index, name: layerNameOnly, isOverlay: true });
              serviceLayers.push(groupLayer);
              index++;
            });

            // USING LAYER GROUPS FOR TOPO
            let layerGroup = new LayerGroup({ layers: serviceLayers, visible: false });
            layerGroup.setProperties({ index: serviceGroup.index, name: serviceGroup.name });
            window.map.addLayer(layerGroup);
            basemapList.push(layerGroup);
          });
        });
      } else {
        // USING LAYER GROUPS FOR TOPO
        let layerGroup = new LayerGroup({ layers: serviceLayers, visible: false });
        layerGroup.setProperties({ index: serviceGroup.index, name: serviceGroup.name });
        window.map.addLayer(layerGroup);
        basemapList.push(layerGroup);
        //basemapIndex++;
      }
    });

    this.setState({ topoLayers: basemapList });
    this.setState({ topoActiveIndex: 0 });

    // NEED TO WAIT A TAD FOR LAYERS TO INIT
    setTimeout(() => {
      this.handleURLParameters();
    }, 100);
  }

  // HANDLE URL PARAMETERS
  handleURLParameters = value => {
    const basemap = helpers.getURLParameter("BASEMAP") !== null ? helpers.getURLParameter("BASEMAP").toUpperCase() : null;
    const name = helpers.getURLParameter("NAME") !== null ? helpers.getURLParameter("NAME").toUpperCase() : null;
    const imagerySliderOpen = helpers.getURLParameter("SLIDER_OPEN") !== null ? helpers.getURLParameter("SLIDER_OPEN").toUpperCase() : null;

    if (basemap === "IMAGERY") {
      this.enableImagery();

      if (imagerySliderOpen === "TRUE") this.setState({ imageryPanelOpen: true });

      if (name !== undefined) {
        for (let index = 0; index < this.state.imageryLayers.length; index++) {
          const layer = this.state.imageryLayers[index];
          const layerName = layer.getProperties().name.toUpperCase();
          if (layerName === name) {
            this.updateImageryLayers(index);
            this.setState({ imagerySliderValue: index, imagerySliderDefaultValue: index });
            return;
          }
        }
      }
    } else if (basemap === "TOPO") {
      this.disableImagery();
      this.enableTopo();

      for (let index = 0; index < this.state.topoLayers.length; index++) {
        let layer = this.state.topoLayers[index];
        const layerName = layer.getProperties().name;
        if (layerName.toUpperCase() === name) {
          this.setState({ topoActiveIndex: index });
          this.setTopoLayerVisiblity(index);
        }
      }
    }
  };

  // CALLED WHEN SLIDING OR TO RESET
  updateImageryLayers(value) {
    for (let index = 0; index < this.state.imageryLayers.length; index++) {
      let layer = this.state.imageryLayers[index];
      if (value === -1) layer.setVisible(false);
      else {
        const layerIndex = layer.getProperties().index;
        const indexRatio = 1 - Math.abs(layerIndex - value);
        if (layerIndex === value) {
          layer.setOpacity(1);
          layer.setVisible(true);
        } else if (indexRatio < 0) {
          layer.setOpacity(0);
          layer.setVisible(false);
        } else {
          layer.setOpacity(indexRatio);
          layer.setVisible(true);
        }
      }
    }
  }

  // SLIDER CHANGE EVENT
  onSliderChange = value => {
    this.updateImageryLayers(value);
    this.setState({ imagerySliderValue: value });
  };

  // PANEL DROP DOWN BUTTON
  onImageryArrowClick = value => {
    // DISABLE TOPO
    this.disableTopo();

    // ENABLE IMAGERY
    this.setState({ topoPanelOpen: false, activeButton: "imagery", imageryPanelOpen: !this.state.imageryPanelOpen });
    this.updateImageryLayers(this.state.imagerySliderValue);
    this.state.streetsLayer.setVisible(this.state.streetsCheckbox);
    this.state.worldImageryLayer.setVisible(this.state.streetsCheckbox);

    // APP STATS
    helpers.addAppStat("Imagery", "Arrow");
  };

  onImageryButtonClick = value => {
    // DISABLE TOPO
    this.disableTopo();

    // CLOSE PANEL, ONLY IF ALREADY OPEN
    if (this.state.imageryPanelOpen) this.setState({ imageryPanelOpen: !this.state.imageryPanelOpen });

    this.enableImagery();

    // APP STATS
    helpers.addAppStat("Imagery", "Button");
  };

  enableImagery = value => {
    if(window.appConfig.TwoBaseMapsOnly) {
      this.setBgMapVisibilty(this.state.backgroundLayers,img_background_map,true,0);
    }
    else {
      // ENABLE IMAGERY
      this.updateImageryLayers(this.state.imagerySliderValue);

      this.setState({ topoPanelOpen: false, activeButton: "imagery" });
      this.state.streetsLayer.setVisible(this.state.streetsCheckbox);
      this.state.worldImageryLayer.setVisible(this.state.streetsCheckbox);
      this.setTopoLayerVisiblity(-1);
    }
    // EMIT A BASEMAP CHANGE
    window.emitter.emit("basemapChanged", "IMAGERY");
  };

  disableImagery = value => {
    // DISABLE IMAGERY
    if(window.appConfig.TwoBaseMapsOnly) {
      this.setBgMapVisibilty(this.state.backgroundLayers,img_background_map,false,-1);
      this.setState({ imageryPanelOpen: false });
    }
    else {
      this.state.streetsLayer.setVisible(false);
      this.state.worldImageryLayer.setVisible(false);
      this.setState({ imageryPanelOpen: false });
      this.updateImageryLayers(-1);
    }
  };

  onStreetsCheckbox = evt => {
    this.state.streetsLayer.setVisible(evt.target.checked);
    this.setState({ streetsCheckbox: evt.target.checked });
  };

  onTopoCheckbox = evt => {
    //this.state.streetsLayer.setVisible(evt.target.checked);
    this.setState({ topoCheckbox: evt.target.checked }, () => {
      this.enableTopo();
    });
  };

  onCollapsedClick = evt => {
    // HIDE OPEN PANELS
    if (this.state.containerCollapsed === false) {
      this.setState({ imageryPanelOpen: false });
      this.setState({ topoPanelOpen: false });
    }

    this.setState({ containerCollapsed: !this.state.containerCollapsed });
  };

  enableTopo = value => {
    // DISABLE IMAGERY
    this.disableImagery();
    this.setState({ activeButton: "topo" });
    //BLI:working on this now
    if(window.appConfig.TwoBaseMapsOnly) {
      //BLI:debugging code: turnoff background map
      if(this.state.topoPanelOpen)
      {
        this.disableTopo();//turnoff background map
      }
      else {
      this.setBgMapVisibilty(this.state.backgroundLayers,vector_background_map,true,0);
      this.setState({ imageryPanelOpen: false,topoPanelOpen: true });
      }
    }
    else {
      this.setTopoLayerVisiblity(this.state.topoActiveIndex);
    }

    // EMIT A BASEMAP CHANGE
    window.emitter.emit("basemapChanged", "TOPO");
  };

  disableTopo = value => {
    if(window.appConfig.TwoBaseMapsOnly) {
      this.setBgMapVisibilty(this.state.backgroundLayers,vector_background_map,false,-1);
    }
    else {
       this.setTopoLayerVisiblity(-1);
    }
  };

  // TOPO BUTTON
  onTopoButtonClick = evt => {
    // CLOSE PANEL ONLY IF ALREADY OPEN
    if (this.state.topoPanelOpen) this.setState({ topoPanelOpen: !this.state.topoPanelOpen });

    this.enableTopo();

    // APP STATS
    helpers.addAppStat("Topo", "Button");
  };

  // PANEL DROP DOWN BUTTON
  onTopoArrowClick = evt => {
    this.enableTopo();
    this.setState({ topoPanelOpen: !this.state.topoPanelOpen });
    // APP STATS
    helpers.addAppStat("Topo", "Arrow");
  };

  // CLICK ON TOPO THUMBNAILS
  onTopoItemClick = activeIndex => {
    this.setState({ topoActiveIndex: activeIndex });
    this.setTopoLayerVisiblity(activeIndex);
    this.setState({ topoPanelOpen: false });
  };

  // ADJUST VISIBILITY
  setTopoLayerVisiblity(activeIndex) {
    for (let index = 0; index < this.state.topoLayers.length; index++) {
      let layer = this.state.topoLayers[index];
      const layerIndex = layer.getProperties().index;
      if (layerIndex === activeIndex) {
        //let layers = layer.getLayers();

        layer.getLayers().forEach(layer => {
          if (layer.get("isOverlay") && this.state.topoCheckbox) layer.setVisible(true);
          else if (layer.get("isOverlay") && !this.state.topoCheckbox) layer.setVisible(false);
        });

        layer.setVisible(true);
      } else {
        layer.setVisible(false);
      }
    }
  }

  render() {
    // STYLE USED BY SLIDER
    const sliderWrapperStyle = {
      width: 60,
      marginLeft: 13,
      height: 225,
      marginTop: 8,
      marginBottom: 15
    };
    let content=null;
    if(window.appConfig.BLI_Under_Dev.Dev_NoBaseMapOption) {
      content=(<div></div>);
    }
    else if(window.appConfig.BLI_Under_Dev.Dev_SimpleViewMap_only) {
      //BLI: ESRI imagery or open street map as background map
      content= (
        <div>
          <div id="sc-basemap-main-container">
            <div id="sc-basemap-collapse-button" className={this.state.containerCollapsed ? "sc-basemap-collapse-button closed" : "sc-basemap-collapse-button"} onClick={this.onCollapsedClick} />
            <div className={this.state.containerCollapsed ? "sc-hidden" : "sc-basemap-imagery"}>
              <button className={this.state.activeButton === "imagery" ? "sc-button sc-basemap-imagery-button active" : "sc-button sc-basemap-imagery-button"} onClick={this.onImageryButtonClick}>
                Imagery
              </button>
              {/**disable dropdown list option */}
              {/* <button className="sc-button sc-basemap-arrow" onClick={this.onImageryArrowClick}></button> */}
            </div>
            <div className={this.state.containerCollapsed ? "sc-hidden" : "sc-basemap-topo"}>
              <button className={this.state.activeButton === "topo" ? "sc-button sc-basemap-topo-button active" : "sc-button sc-basemap-topo-button"} onClick={this.onTopoButtonClick}>
                Topo
              </button>
              {/**disable dropdown list option */}
              {/* <button className="sc-button sc-basemap-arrow" onClick={this.onTopoArrowClick}></button> */}
            </div>
          </div>
        </div> 
      );
    }
    else {
      content =( 
        <div>
          <div id="sc-basemap-main-container">
            <div id="sc-basemap-collapse-button" className={this.state.containerCollapsed ? "sc-basemap-collapse-button closed" : "sc-basemap-collapse-button"} onClick={this.onCollapsedClick} />
            <div className={this.state.containerCollapsed ? "sc-hidden" : "sc-basemap-imagery"}>
              <button className={this.state.activeButton === "imagery" ? "sc-button sc-basemap-imagery-button active" : "sc-button sc-basemap-imagery-button"} onClick={this.onImageryButtonClick}>
                Imagery
              </button>
              <button className="sc-button sc-basemap-arrow" onClick={this.onImageryArrowClick}></button>
            </div>
            <div className={this.state.containerCollapsed ? "sc-hidden" : "sc-basemap-topo"}>
              <button className={this.state.activeButton === "topo" ? "sc-button sc-basemap-topo-button active" : "sc-button sc-basemap-topo-button"} onClick={this.onTopoButtonClick}>
                Topo
              </button>
              <button className="sc-button sc-basemap-arrow" onClick={this.onTopoArrowClick}></button>
            </div>
          </div>
          <div id="sc-basemap-imagery-slider-container" className={this.state.imageryPanelOpen ? "sc-basemap-imagery-slider-container" : "sc-hidden"}>
            <label className="sc-basemap-streets-label">
              <input className="sc-basemap-streets-checkbox" id="sc-basemap-streets-checkbox" type="checkbox" onChange={this.onStreetsCheckbox} checked={this.state.streetsCheckbox}></input>&nbsp;Streets
            </label>
            <Slider
              included={false}
              style={sliderWrapperStyle}
              marks={this.state.imagerySliderMarks}
              vertical={true}
              max={this.state.imagerySliderMax}
              min={this.state.imagerySliderMin}
              step={0.01}
              defaultValue={this.state.imagerySliderDefaultValue}
              onChange={this.onSliderChange}
              value={this.state.imagerySliderValue}
            />
          </div>
          <div className={this.state.topoPanelOpen ? "sc-basemap-topo-container" : "sc-hidden"}>
            <label className="sc-basemap-topo-label">
              <input className="sc-basemap-topo-checkbox" id="sc-basemap-topo-checkbox" type="checkbox" onChange={this.onTopoCheckbox} checked={this.state.topoCheckbox}></input>&nbsp;Overlay
            </label>
            {BasemapConfig.topoServices.map((service, index) => (
              <BasemapItem key={helpers.getUID()} index={index} topoActiveIndex={this.state.topoActiveIndex} service={service} onTopoItemClick={this.onTopoItemClick} />
            ))}
          </div>
        </div>
      );
    }
    return content;
  }
}

export default BasemapSwitcher;

class BasemapItem extends Component {
  state = {};
  render() {
    return (
      <div
        className={this.props.topoActiveIndex === this.props.index ? "sc-basemap-topo-item-container active" : "sc-basemap-topo-item-container"}
        onClick={() => {
          this.props.onTopoItemClick(this.props.index);
        }}
      >
        {this.props.service.name}
        <img className="sc-basemap-topo-image" src={images[this.props.service.image]} alt={this.props.service.image}></img>
      </div>
    );
  }
}

// IMPORT ALL IMAGES
const images = importAllImages(require.context("./images", false, /\.(png|jpe?g|svg|gif)$/));
function importAllImages(r) {
  let images = {};
  r.keys().map((item, index) => (images[item.replace("./", "")] = r(item)));
  return images;
}

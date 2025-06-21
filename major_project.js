// Data Preparation
var AOI = ee.FeatureCollection('projects/ee-avezmulani786/assets/Amazon_ROI')
Map.centerObject(AOI,9)
Map.addLayer(AOI,{},"Area of Interest")

var aoiArea= AOI.geometry().area().divide(1000000)
print("AOI area :",aoiArea,"[km²]")

function applyScaleFactors(image) {
var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);
return image.addBands(opticalBands, null, true)
.addBands(thermalBands, null, true);
}

function ndviLS(image){
var ndvi = image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
return image.addBands(ndvi);
}

function maskS2clouds(image) {
var qa = image.select('QA60');

var cloudBitMask = 1 << 10;
var cirrusBitMask = 1 << 11;

var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
.and(qa.bitwiseAnd(cirrusBitMask).eq(0));
return image.updateMask(mask).divide(10000);
}

function ndviSE(image){
var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
return image.addBands(ndvi);
}


var landsat2015 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
.filterDate('2015-05-01', '2015-08-30')
.filterBounds(AOI)
.filter(ee.Filter.lt('CLOUD_COVER', 10))
.aside(print)
.map(applyScaleFactors)
.map(ndviLS)
.median()
.clip(AOI)

var visParLandsat = {
bands: ['SR_B4', 'SR_B3', 'SR_B2'],
min: 0.0,
max: 0.3,
};
Map.addLayer(landsat2015,visParLandsat,'Landsat 2015')

var visParLandsatFalseColor = {
bands: ['SR_B5', 'SR_B4', 'SR_B3'],
min: 0.0,
max: 0.5,
};
Map.addLayer(landsat2015, visParLandsatFalseColor,'Landsat 2015 False Color',0)

var nir = landsat2015.select('SR_B5');
var red = landsat2015.select('SR_B4');
var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
Map.addLayer(ndvi,{min: -1, max: 1, palette: ['blue', 'white', 'green']},'NDVI2015')

var ndvi2 = landsat2015.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
Map.addLayer(ndvi2,{min: -1, max: 1, palette: ['blue', 'white', 'green']},'NDVI2015 2')

var sentinel2019 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
.filterDate('2019-05-01', '2019-08-30')
.filterBounds(AOI)
.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
.aside(print)
.map(maskS2clouds)
.map(ndviSE)
.median()
.clip(AOI);

var visParSentinel = {
min: 0.0,
max: 0.3,
bands: ['B4', 'B3', 'B2'],
};

Map.addLayer(sentinel2019, visParSentinel, 'Sentinel 2019');
Map.addLayer(sentinel2019.select('NDVI'),{min: -1, max: 1, palette: ['blue', 'white',
'green']},'NDVI2019')

var linkedMap = ui.Map();
linkedMap.addLayer(sentinel2019, visParSentinel, 'Sentinel 2019');
linkedMap.centerObject(AOI,9);
linkedMap.setControlVisibility({all: true, zoomControl: true, mapTypeControl: true})
var linker = ui.Map.Linker([ui.root.widgets().get(0), linkedMap]);

var title_during= Map.add(ui.Label(
'2015', {fontWeight: 'bold', fontSize: '20px', position: 'bottom-left', color: 'slateGrey'}));
var title_after= linkedMap.add(ui.Label(
'2019', {fontWeight: 'bold', fontSize: '20px', position: 'bottom-right', color: 'slateGrey'}));
var splitPanel = ui.SplitPanel({
firstPanel: linker.get(0),
secondPanel: linker.get(1),
orientation: 'horizontal',
wipe: true,
style: {stretch: 'both'}
});
ui.root.widgets().reset([splitPanel]);

var no_forest =ee.FeatureCollection('users/vyordanov/workshops/deforestation/nonForestPolygons')
var forest = ee.FeatureCollection('users/vyordanov/workshops/deforestation/forestPolygons')
Map.addLayer(no_forest.draw('red'),{},' No Forest Polygons')
Map.addLayer(forest.draw('green'),{},'Forest Polygons')

var bandsLandsat = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'NDVI'];

var sampledNonForestLandsat = landsat2015.select(bandsLandsat).sampleRegions({
collection: no_forest, //
properties: ['landcover'],
scale: 30
});
var no_forest =ee.FeatureCollection('users/vyordanov/workshops/deforestation/nonForestPolygons')
var forest = ee.FeatureCollection('users/vyordanov/workshops/deforestation/forestPolygons')
Map.addLayer(no_forest.draw('red'),{},' No Forest Polygons')
Map.addLayer(forest.draw('green'),{},'Forest Polygons')

var bandsLandsat = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'NDVI'];

var sampledNonForestLandsat = landsat2015.select(bandsLandsat).sampleRegions({
collection: no_forest, //
properties: ['landcover'],
scale: 30
});

var threshold=0.8;
var trainNonForestLandsat =
sampledNonForestLandsat.randomColumn('random').filter(ee.Filter.lte('random',threshold));
var testNonForestLandsat =
sampledNonForestLandsat.randomColumn('random').filter(ee.Filter.gt('random', threshold));

var sampledForestLandsat = landsat2015.select(bandsLandsat).sampleRegions({
collection: forest,
properties: ['landcover'],
scale: 30
});

var threshold=0.8;
var trainForestLandsat =
sampledForestLandsat.randomColumn('random').filter(ee.Filter.lte('random',threshold));
var testForestLandsat =
sampledForestLandsat.randomColumn('random').filter(ee.Filter.gt('random', threshold));

var trainLandsat = trainForestLandsat.merge(trainNonForestLandsat);
var testLandsat = testForestLandsat.merge(testNonForestLandsat);

var classifier2015 = ee.Classifier.smileRandomForest(10).train({
features: trainLandsat,
classProperty: 'landcover',
inputProperties: bandsLandsat
});

print('Landsat Random Forest error matrix: ', classifier2015.confusionMatrix());
print('Landsat Random Forest accuracy: ', classifier2015.confusionMatrix().accuracy());
print("Landsat Random Forest Cohen's Kappa:", classifier2015.confusionMatrix().kappa());

var classified2015 = landsat2015.select(bandsLandsat).classify(classifier2015);

var testingLandsat = testLandsat.classify(classifier2015);
var testAccuracyLandsat = testingLandsat.errorMatrix('landcover', 'classification');
print('Landsat Validation error matrix: ', testAccuracyLandsat);
print('Landsat Validation overall accuracy: ', testAccuracyLandsat.accuracy());
print("Landsat Validation Cohen's Kappa:", testAccuracyLandsat.kappa());

var refPoints_2015 = ee.FeatureCollection('users/vyordanov/Amazon/Amazon2015_refPoints')
Map.addLayer(refPoints_2015.filter(ee.Filter.eq('land_cover',0)).draw('red'),{},'External Validation Points NF 2015',0)
Map.addLayer(refPoints_2015.filter(ee.Filter.eq('land_cover',1)).draw('green'),{},'External Validation Points F 2015',0)
refPoints_2015 = refPoints_2015.map(function(feat){
return ee.Feature(feat.geometry(), {
landcover: feat.get('land_cover'),
})
})

var sampleRefPointsLandsat = classified2015.select('classification').sampleRegions({
collection: refPoints_2015,
properties: ['landcover'],
scale: 30
});

print(sampleRefPointsLandsat)
var refAccuracyLandsat = sampleRefPointsLandsat.errorMatrix('landcover', 'classification');
print('Landsat External Validation error matrix: ', refAccuracyLandsat);
print('Landsat External Validation overall accuracy: ', refAccuracyLandsat.accuracy());
print("Landsat External Validation Cohen's Kappa:", refAccuracyLandsat.kappa());

var palette = [
'red', // non-forest
'green', // forest
];

Map.addLayer(classified2015, {min: 0, max: 1, palette: palette}, 'Forest Classification 2015',0);

// SENTINEL 2 working

var bandSentinel = ['B2', 'B3', 'B4', 'B8','NDVI'];

var sampledNonForestSentinel= sentinel2019.select(bandSentinel).sampleRegions({
collection: no_forest,
properties: ['landcover'],
scale: 10
});

var threshold=0.8;
var trainNonForestSentinel = sampledNonForestSentinel.randomColumn('random').filter(ee.Filter.lte('random',threshold));
var testNonForestSentinel = sampledNonForestSentinel.randomColumn('random').filter(ee.Filter.gt('random', threshold)); //

var sampledForestSentinel= sentinel2019.select(bandSentinel).sampleRegions({
collection: forest,
properties: ['landcover'],
scale: 10
});


var threshold=0.8;
var trainForestSentinel = sampledForestSentinel.randomColumn('random').filter(ee.Filter.lte('random',threshold));
var testForestSentinel = sampledForestSentinel.randomColumn('random').filter(ee.Filter.gt('random', threshold));

var trainSentinel = trainForestSentinel.merge(trainNonForestSentinel);
var testSentinel = testForestSentinel.merge(testNonForestSentinel);

var classifierSentinel = ee.Classifier.smileRandomForest(10).train({
features: trainSentinel,
classProperty: 'landcover',
inputProperties: bandSentinel
});

print('Sentinel RF error matrix: ', classifierSentinel.confusionMatrix());
print('Sentinel RF accuracy: ', classifierSentinel.confusionMatrix().accuracy());
print("Sentinel RF Cohen's Kappa:", classifierSentinel.confusionMatrix().kappa());

var classified2019 = sentinel2019.select(bandSentinel).classify(classifierSentinel);

var testingSentinel = testSentinel.classify(classifierSentinel);
var testAccuracySentinel = testingSentinel.errorMatrix('landcover', 'classification');
print('Sentinel Validation error matrix: ', testAccuracySentinel);
print('Sentinel Validation overall accuracy: ', testAccuracySentinel.accuracy());
print("Sentinel Validation Cohen's Kappa:", testAccuracySentinel.kappa());

var refPoints_2019 = ee.FeatureCollection('users/vyordanov/Amazon/Amazon2019_refPoints')
refPoints_2019 = refPoints_2019.map(function(feat){
return ee.Feature(feat.geometry(), {
landcover: feat.get('land_cover'),
})
})
var sampleRefPointsSentinel = classified2019.select('classification').sampleRegions({
collection: refPoints_2019,
properties: ['landcover'],
scale: 10
});
print(sampleRefPointsSentinel)

var refAccuracySentinel = sampleRefPointsSentinel.errorMatrix('landcover', 'classification');
print('Sentinel External Validation error matrix: ', refAccuracySentinel);
print('Sentinel External Validation overall accuracy: ', refAccuracySentinel.accuracy());
print("Sentinel External Validation Cohen's Kappa:", refAccuracySentinel.kappa());

Map.addLayer(classified2019, {min: 0, max: 1, palette: palette}, 'Forest Classification 2019');

var classified2015clean = classified2015.focalMode(2)
Map.addLayer(classified2015clean, {min: 0, max: 1, palette: palette}, 'Forest Classification 2015 Cleaned');

var classified2019clean = classified2019.focalMode(2)
Map.addLayer(classified2019clean, {min: 0, max: 1, palette: palette}, 'Forest Classification 2019 Cleaned');

var classified2015_10m = classified2015clean.resample('bicubic').reproject({
'crs': 'EPSG:32721',
'scale': 10})

print('Forest Classification 2015 10m scale:', classified2015_10m.projection().nominalScale());

var classified2019_10m = classified2019clean.reproject({
'crs': 'EPSG:32721',
'scale': 10})
print('Forest Classification 2019 10m scale:', classified2019_10m.projection().nominalScale());

Export.image.toAsset({
image: classified2015_10m,
description: 'classified2015_10m',
assetId: 'PATH_TO_YOUR_ASSET_FOLDER/classified2015_10m',
scale: 10,
crs: 'EPSG:32721',
region: AOI,
maxPixels: 1e13
})
Export.image.toAsset({
image: classified2019_10m,
description: 'classified2019_10m',
assetId: 'PATH_TO_YOUR_ASSET_FOLDER/classified2019_10m',
scale: 10,
crs: 'EPSG:32721',
region: AOI,
maxPixels: 1e13
})

var classified2015_10m = ee.Image('users/vyordanov/workshops/deforestation/classified2015_10m')
var classified2019_10m = ee.Image('users/vyordanov/workshops/deforestation/classified2019_10m')

Map.addLayer(classified2015_10m,{min: 0, max: 1, palette: palette},'Forest Classification 2015 10m',0)
Map.addLayer(classified2019_10m,{min: 0, max: 1, palette: palette},'Forest Classification 2019 10m',0)

var diff=classified2015_10m.subtract(classified2019_10m);
Map.addLayer(diff,{min:-1,mean:0,max:1, palette:['0000FF','00FF00','FF0000']},'2015-2019 Difference');

var forest_loss=diff.updateMask(diff.eq(1))
Map.addLayer(forest_loss,{palette:'FF0000'}, 'Forest Loss 2015-2019')

var forest_gain=diff.updateMask(diff.eq(-1))
Map.addLayer(forest_gain,{palette:'00FF00'}, 'Forest Gain 2015-2019');


var aoiArea=AOI.geometry().area().divide(1000000);
print('AOI Area: ',aoiArea,"[km²]")

var areaLoss =
forest_loss.multiply(ee.Image.pixelArea().divide(1000000));

var statsLoss = areaLoss.reduceRegion({
reducer: ee.Reducer.sum(),
geometry: AOI,
scale: 10,
maxPixels: 1e13,
tileScale:16
}).getNumber('classification');
print(
'Forest Loss 2015-2019:',
statsLoss,
"[km²]"
);

var areaGain = forest_gain.multiply(ee.Image.pixelArea().divide(-1000000));
var statsGain = areaGain.reduceRegion({
reducer: ee.Reducer.sum(),
geometry: AOI,
scale: 10,
maxPixels: 1e13,
tileScale:16
}).getNumber('classification');
print(
'Forest Gain 2015-2019:',
statsGain,
"[km²]"
);

var relLoss=statsLoss.divide(aoiArea);
print("Relative Loss: ",relLoss.multiply(100),"%")
var relGain=statsGain.divide(aoiArea);
print("Relative Gain: ",relGain.multiply(100),"%")

 
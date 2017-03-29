/* jshint browser:true, strict:true */
/* global mapboxgl */

function bindEvent(obj, event, func) {
	"use strict";

	if (obj.addEventListener) {
		obj.addEventListener(event, func);
	} else if (obj.attachEvent) {
		obj.attachEvent('on' + event, func);
	} else {
		throw new Error('No method found to attach event to object');
	}
}

bindEvent(window, 'load', init);

var map;

function init() {
	"use strict";

	echo.init({
		callback: function(el, op) {
			if (op === 'load') {
				el.className='';
			}
		},
	});
	var markers = fetchMarkers();
	map = initMap(markers);
	adjustMapTop();
	showMarkerForCurrentArticle(markers, true);

	bindEvent(window, 'scroll', function() {
		adjustMapTop();
		showMarkerForCurrentArticle(markers, false);
	});
}

function forAllArticles(callback) {
	"use strict";

	var articles = document.querySelectorAll('article.post');

	for (var i = 0; i < articles.length; ++i) {
		if (!callback(i, articles[i], articles.length))
			return;
	}
}

function initMap(markers) {
	"use strict";

	mapboxgl.accessToken = 'pk.eyJ1IjoiYWJ1c3RhbnkiLCJhIjoiXzRMaXJZTSJ9.O90zsWmkzkJuUhbg6ASDKg';
	var map = new mapboxgl.Map({
		container: 'map',
		style: 'mapbox://styles/mapbox/streets-v9',
		zoom: 12,
	});

	map.addControl(new mapboxgl.NavigationControl());

	for (var idx in markers) {
		markers[idx].addTo(map);
	}

	return map;
}

function createMarker(idx) {
	var el = document.createElement('div');
	el.className = 'map-marker';
	el.appendChild(document.createTextNode(idx));

	el.onclick = function() {
		document.location.hash = '#post-' + idx;
	};

	return new mapboxgl.Marker(el, {});
}

// Returns a hash of (article DOM element, leaflet marker)
function fetchMarkers() {
	"use strict";

	var markers = {};

	forAllArticles(function(i, article, nArticles) {
		var pos = article.getAttribute('data-position');
		var idx = article.getAttribute('data-index');

		if (!pos)
			return true;

		var tokens = pos.split(/\s*,\s*/);

	    if (tokens.length !== 2) {
			throw new Error('Invalid marker string: ' + markerString);
		}

		var lat = Number(tokens[0]);
		var lon = Number(tokens[1]);

		if (isNaN(lat) || isNaN(lon)) {
			throw new Error('Invalid coordinates: ' + markerString);
		}

		var el = document.createElement('div');
		el.className = 'map-marker';
		el.appendChild(document.createTextNode(idx));

		markers[idx] = createMarker(idx).setLngLat([lon, lat]);

		return true;
	});

	return markers;
}

function getStyle(el) {
	"use strict";

	// IE
	if (el.currentStyle) {
		return el.currentStyle;
	}

	return getComputedStyle(el);
}

function getWindowHeight() {
	"use strict";

	if ('innerHeight' in window)
		return window.innerHeight;

	// IE
	return document.documentElement.offsetHeight;
}

function adjustMapTop() {
	"use strict";

	var mapDiv = document.getElementById('map');
	var title = document.getElementById('page-title');
	var rect = title.getBoundingClientRect();
	var bottomMargin = parseInt(getStyle(title).marginBottom);
	var mapTop = rect.bottom + bottomMargin;

	if (mapTop < 0)
		mapTop = 0;

	mapDiv.style.top = mapTop + 'px';
	map.resize();
}

var panTimeoutId = null;
var lastShownMarker = null;

function showMarkerForCurrentArticle(markers, lookBelow) {
	"use strict";

	var windowHeight = getWindowHeight();
	var topMost = null;
	var minYPost = null;
	var minYDistance = null;

	forAllArticles(function (idx, article, nArticles) {
		var bb = article.getBoundingClientRect();

		if (minYPost === null || (minYDistance < bb.top && bb.top < 0)) {
			minYDistance = bb.top;
			minYPost = article;
		}

		// Stop as soon as we find an article that is in the window
		if (bb.top > 0 && ((bb.top < windowHeight) || lookBelow)) {
			topMost = article;

			// Only break the loop if we have a marker for this post
			if (showMarkerForArticle(markers, article))
				return false;
		}

		return true;
	});

	// If we have an article on screen but it has no position, do nothing except
	// if we never centered the map
	if (topMost !== null && lastShownMarker !== null)
		return;

	// If we have no article title on screen, pick the one that's closest to the
	// top edge

	// Maybe we have no posts at all?
	if (minYPost === null) {
		return;
	}

	showMarkerForArticle(markers, minYPost);
}

function showMarkerForArticle(markers, article) {
	"use strict";

	var idx = article.getAttribute('data-index');

	if (!idx)
		return false;

	var marker = markers[idx];

	if (!marker)
		return false;

	if (panTimeoutId) {
		clearTimeout(panTimeoutId);
	}

	// The pan call is animated, therefore we need to "debounce" the calls to
	// avoid jumping all around
	panTimeoutId = setTimeout(function() {
		map.panTo(marker.getLngLat(), {animate: true});
	}, 300);

	lastShownMarker = marker;

	return true;
}

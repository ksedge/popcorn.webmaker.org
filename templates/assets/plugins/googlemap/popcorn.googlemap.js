// PLUGIN: Google Maps
/*global google*/

var googleCallback;
(function ( Popcorn ) {

  // We load our own cached copy of this in order to deal with mix-content (http vs. https).
  // At some point the stamen API is going to change, and this will break.
  // We'll need to watch for this. NOTE: if you change the location of this file, the path
  // below needs to reflect that change.
  var STAMEN_BUTTER_CACHED_URL = "/external/stamen/tile.stamen-1.2.0.js";

  var _mapFired = false,
      _mapLoaded = false,
      // Store location objects in case the same string location is used multiple times.
      _cachedGeoCode = {},
      MAP_FAILURE_TIMEOUT = 100,
      geocoder;

  //google api callback
  window.googleCallback = function( data ) {
    // ensure all of the maps functions needed are loaded
    // before setting _maploaded to true
    if ( typeof google !== "undefined" && google.maps && google.maps.Geocoder && google.maps.LatLng ) {
      geocoder = new google.maps.Geocoder();
      Popcorn.getScript( STAMEN_BUTTER_CACHED_URL, function() {
        _mapLoaded = true;
      });
    } else {
      setTimeout(function () {
        googleCallback( data );
      }, 10);
    }
  };
  // function that loads the google api
  function loadMaps() {
    // for some reason the Google Map API adds content to the body
    if ( document.body ) {
      _mapFired = true;
      Popcorn.getScript( "//maps.google.com/maps/api/js?sensor=false&callback=googleCallback" );
    } else {
      setTimeout(function () {
        loadMaps();
      }, 10);
    }
  }

  function buildMap( options, mapDiv, pluginInstance ) {
    var type = options.type ? options.type.toUpperCase() : "ROADMAP",
        layer;

    // See if we need to make a custom Stamen map layer
    if ( type === "STAMEN-WATERCOLOR" ||
         type === "STAMEN-TERRAIN"    ||
         type === "STAMEN-TONER" ) {
      // Stamen types are lowercase
      layer = type.replace( "STAMEN-", "" ).toLowerCase();
    }

    var map = new google.maps.Map( mapDiv, {
      // If a custom layer was specified, use that, otherwise use type
      mapTypeId: layer ? layer : google.maps.MapTypeId[ type ],
      // Hide the layer selection UI
      mapTypeControlOptions: {
        mapTypeIds: []
      }
    });

    // Used to notify any users of the plugin when the maps has completely loaded
    google.maps.event.addListenerOnce( map, "idle", function() {
      pluginInstance.emit( "googlemaps-loaded" );
    });

    if ( layer ) {
      map.mapTypes.set( layer, new google.maps.StamenMapType( layer ) );
    }

    return map;
  }

  /**
   * googlemap popcorn plug-in
   * Adds a map to the target div centered on the location specified by the user
   * Options parameter will need a start, end, target, type, zoom, lat and lng, and location
   * -Start is the time that you want this plug-in to execute
   * -End is the time that you want this plug-in to stop executing
   * -Target is the id of the DOM element that you want the map to appear in. This element must be in the DOM
   * -Type [optional] either: HYBRID (default), ROADMAP, SATELLITE, TERRAIN, STREETVIEW, or one of the
   *                          Stamen custom map types (http://http://maps.stamen.com): STAMEN-TONER,
   *                          STAMEN-WATERCOLOR, or STAMEN-TERRAIN.
   * -Zoom [optional] defaults to 10
   * -Heading [optional] STREETVIEW orientation of camera in degrees relative to true north (0 north, 90 true east, ect)
   * -Pitch [optional] STREETVIEW vertical orientation of the camera (between 1 and 3 is recommended)
   * -Lat and Lng: the coordinates of the map must be present if location is not specified.
   * -Height [optional] the height of the map, in "px" or "%". Defaults to "100%".
   * -Width [optional] the width of the map, in "px" or "%". Defaults to "100%".
   * -Location: the adress you want the map to display, must be present if lat and lng are not specified.
   * Note: using location requires extra loading time, also not specifying both lat/lng and location will
   * cause and error.
   *
   * Tweening works using the following specifications:
   * -location is the start point when using an auto generated route
   * -tween when used in this context is a string which specifies the end location for your route
   * Note that both location and tween must be present when using an auto generated route, or the map will not tween
   * -interval is the speed in which the tween will be executed, a reasonable time is 1000 ( time in milliseconds )
   * Heading, Zoom, and Pitch streetview values are also used in tweening with the autogenerated route
   *
   * -tween is an array of objects, each containing data for one frame of a tween
   * -position is an object with has two paramaters, lat and lng, both which are mandatory for a tween to work
   * -pov is an object which houses heading, pitch, and zoom paramters, which are all optional, if undefined, these values default to 0
   * -interval is the speed in which the tween will be executed, a reasonable time is 1000 ( time in milliseconds )
   *
   * @param {Object} options
   *
   * Example:
   var p = Popcorn("#video")
   .googlemap({
    start: 5, // seconds
    end: 15, // seconds
    type: "ROADMAP",
    target: "map"
   } )
   *
   */
  Popcorn.plugin( "googlemap", function ( options ) {
    var outerdiv, innerdiv, map, location,
        target = Popcorn.dom.find( options.target ),
        that = this,
        ranOnce = false;

    if ( !target ) {
      target = that.media.parentNode;
    }

    options._target = target;

    options.type = options.type || "ROADMAP";
    options.lat = options.lat || 0;
    options.lng = options.lng || 0;
    options.height = options.height + "%";
    options.width = options.width + "%";
    options.left = options.left + "%";
    options.top = options.top + "%";

    // if this is the first time running the plugins
    // call the function that gets the sctipt
    if ( !_mapFired ) {
      loadMaps();
    }

    // create a new div this way anything in the target div is left intact
    // this is later passed on to the maps api
    innerdiv = document.createElement( "div" );
    innerdiv.style.width = "100%";
    innerdiv.style.height = "100%";

    outerdiv = document.createElement( "div" );
    outerdiv.id = Popcorn.guid( "googlemap" );
    outerdiv.style.width = options.width;
    outerdiv.style.height = options.height;
    outerdiv.style.left = options.left;
    outerdiv.style.top = options.top;
    outerdiv.style.zIndex = +options.zindex;
    outerdiv.style.position = "absolute";
    outerdiv.classList.add( options.transition );
    outerdiv.classList.add( "off" );

    outerdiv.appendChild( innerdiv );
    options._container = outerdiv;

    if ( target ) {
      target.appendChild( outerdiv );
    }

    function geoCodeCallback( results, status ) {
      // second check for innerdiv since it could have disappeared before
      // this callback is actually run
      if ( !innerdiv ) {
        return;
      }

      if ( status === google.maps.GeocoderStatus.OK ) {
        options.lat = results[ 0 ].geometry.location.lat();
        options.lng = results[ 0 ].geometry.location.lng();
        _cachedGeoCode[ options.location ] = location = new google.maps.LatLng( options.lat, options.lng );

        map = buildMap( options, innerdiv, that );
      } else if ( status === google.maps.GeocoderStatus.OVER_QUERY_LIMIT ) {
        setTimeout(function() {
          // calls an anonymous google function called on separate thread
          geocoder.geocode({
            "address": options.location
          }, geoCodeCallback );
        }, MAP_FAILURE_TIMEOUT );
      } else {
        // Some other failure occured
        console.warn( "Google maps geocoder returned status: " + status );
      }
    }

    // ensure that google maps and its functions are loaded
    // before setting up the map parameters
    var isMapReady = function () {
      if ( _mapLoaded ) {
        if ( innerdiv ) {
          if ( options.location ) {
            location = _cachedGeoCode[ options.location ];

            if ( location ) {
              map = buildMap( options, innerdiv, that );
            } else {
              // calls an anonymous google function called on separate thread
              geocoder.geocode({
                "address": options.location
              }, geoCodeCallback );
            }

          } else {
            location = new google.maps.LatLng( options.lat, options.lng );
            map = map = buildMap( options, innerdiv, that );
          }
        }
      } else {
          setTimeout(function () {
            isMapReady();
          }, 5);
        }
      };

    isMapReady();

    options.toString = function() {
      return options.location || ( ( options.lat && options.lng ) ? options.lat + ", " + options.lng : options._natives.manifest.options.location[ "default" ] );
    };

    return {
      /**
       * @member webpage
       * The start function will be executed when the currentTime
       * of the video reaches the start time provided by the
       * options variable
       */
      start: function( event, options ) {
        var that = this,
            sView,
            MAX_MAP_ZOOM_VALUE = 22,
            DEFAULT_MAP_ZOOM_VALUE = options._natives.manifest.options.zoom[ "default" ],
            MAX_MAP_PITCH_VALUE = 12,
            DEFAULT_MAP_PITCH_VALUE = options._natives.manifest.options.pitch[ "default" ],
            MAX_MAP_HEADING_VALUE = 12,
            DEFAULT_MAP_HEADING_VALUE = options._natives.manifest.options.heading[ "default" ];

        // ensure the map has been initialized in the setup function above
        var isMapSetup = function() {

          function tween( rM, t ) {

            var computeHeading = google.maps.geometry.spherical.computeHeading;
            setTimeout(function() {

              var current_time = that.media.currentTime;

              //  Checks whether this is a generated route or not
              if ( typeof options.tween === "object" ) {

                for ( var i = 0, m = rM.length; i < m; i++ ) {

                  var waypoint = rM[ i ];

                  //  Checks if this position along the tween should be displayed or not
                  if ( current_time >= ( waypoint.interval * ( i + 1 ) ) / 1000 &&
                     ( current_time <= ( waypoint.interval * ( i + 2 ) ) / 1000 ||
                       current_time >= waypoint.interval * ( m ) / 1000 ) ) {

                    sView3.setPosition( new google.maps.LatLng( waypoint.position.lat, waypoint.position.lng ) );

                    sView3.setPov({
                      heading: waypoint.pov.heading || computeHeading( waypoint, rM[ i + 1 ] ) || 0,
                      zoom: waypoint.pov.zoom || 0,
                      pitch: waypoint.pov.pitch || 0
                    });
                  }
                }

                //  Calls the tween function again at the interval set by the user
                tween( rM, rM[ 0 ].interval );
              } else {

                for ( var k = 0, l = rM.length; k < l; k++ ) {

                  var interval = options.interval;

                  if( current_time >= (interval * ( k + 1 ) ) / 1000 &&
                    ( current_time <= (interval * ( k + 2 ) ) / 1000 ||
                      current_time >= interval * ( l ) / 1000 ) ) {

                    sView2.setPov({
                      heading: computeHeading( rM[ k ], rM[ k + 1 ] ) || 0,
                      zoom: options.zoom,
                      pitch: options.pitch || 0
                    });
                    sView2.setPosition( checkpoints[ k ] );
                  }
                }

                tween( checkpoints, options.interval );
                }
            }, t );
          }

          if ( map && !ranOnce ) {
            options._map = map;
            ranOnce = true;
            // reset the location and zoom just in case the user played with the map
            outerdiv.classList.remove( "off" );
            outerdiv.classList.add( "on" );
            google.maps.event.trigger( map, "resize" );
            map.setCenter( location );

            // make sure options.zoom is a number
            if ( options.zoom && typeof options.zoom !== "number" ) {
              options.zoom = +options.zoom >= 0 && +options.zoom <= MAX_MAP_ZOOM_VALUE ? +options.zoom : DEFAULT_MAP_ZOOM_VALUE;
            }

            map.setZoom( options.zoom );

            //Make sure heading is a number
            if ( options.heading && typeof options.heading !== "number" ) {
              options.heading = +options.heading >= 0 && +options.heading <= MAX_MAP_HEADING_VALUE ? +options.heading : DEFAULT_MAP_HEADING_VALUE;
            }
            //Make sure pitch is a number
            if ( options.pitch && typeof options.pitch !== "number" ) {
              options.pitch = +options.pitch >= 0 && +options.pitch <= MAX_MAP_PITCH_VALUE ? +options.pitch : DEFAULT_MAP_PITCH_VALUE;
            }

            if ( options.type === "STREETVIEW" ) {
              // Switch this map into streeview mode
              map.setStreetView(
                // Pass a new StreetViewPanorama instance into our map
                sView = new google.maps.StreetViewPanorama( innerdiv, {
                  position: location,
                  pov: {
                    heading: options.heading,
                    pitch: options.pitch,
                    zoom: options.zoom
                  }
                })
              );

              //  Determines if we should use hardcoded values ( using options.tween ),
              //  or if we should use a start and end location and let google generate
              //  the route for us
              if ( options.location && typeof options.tween === "string" ) {

              //  Creating another variable to hold the streetview map for tweening,
              //  Doing this because if there was more then one streetview map, the tweening would sometimes appear in other maps
              var sView2 = sView;

                //  Create an array to store all the lat/lang values along our route
                var checkpoints = [];

                //  Creates a new direction service, later used to create a route
                var directionsService = new google.maps.DirectionsService();

                //  Creates a new direction renderer using the current map
                //  This enables us to access all of the route data that is returned to us
                var directionsDisplay = new google.maps.DirectionsRenderer( sView2 );

                var request = {
                  origin: options.location,
                  destination: options.tween,
                  travelMode: google.maps.TravelMode.DRIVING
                };

                //  Create the route using the direction service and renderer
                directionsService.route( request, function( response, status ) {

                  if ( status === google.maps.DirectionsStatus.OK ) {
                    directionsDisplay.setDirections( response );
                    showSteps( response, that );
                  }

                });

                var showSteps = function ( directionResult ) {

                  //  Push new google map lat and lng values into an array from our list of lat and lng values
                  var routes = directionResult.routes[ 0 ].overview_path;
                  for ( var j = 0, k = routes.length; j < k; j++ ) {
                    checkpoints.push( new google.maps.LatLng( routes[ j ].lat(), routes[ j ].lng() ) );
                  }

                  //  Check to make sure the interval exists, if not, set to a default of 1000
                  options.interval = options.interval || 1000;
                  tween( checkpoints, 10 );

                };
              } else if ( typeof options.tween === "object" ) {

                //  Same as the above to stop streetview maps from overflowing into one another
                var sView3 = sView;

                for ( var i = 0, l = options.tween.length; i < l; i++ ) {

                  //  Make sure interval exists, if not, set to 1000
                  options.tween[ i ].interval = options.tween[ i ].interval || 1000;
                  tween( options.tween, 10 );
                }
              }
            }

            // For some reason, in some cases the map can wind up being undefined at this point
            if ( options.onmaploaded && map ) {
              options.onmaploaded( options, map );
            }

          } else if ( ranOnce ) {
            outerdiv.classList.remove( "off" );
            outerdiv.classList.add( "on" );
          } else {
            setTimeout(function () {
              isMapSetup();
            }, 50 );
          }

        };
        isMapSetup();
      },
      /**
       * @member webpage
       * The end function will be executed when the currentTime
       * of the video reaches the end time provided by the
       * options variable
       */
      end: function () {
        // if the map exists hide it do not delete the map just in
        // case the user seeks back to time b/w start and end
        if ( map ) {
          outerdiv.classList.remove( "on" );
          outerdiv.classList.add( "off" );
        }
      },
      _teardown: function ( options ) {
        // the map must be manually removed
        options._target.removeChild( outerdiv );
        innerdiv = map = location = null;

        options._map = null;
      }
    };
  }, {
    about: {
      name: "Popcorn Google Map Plugin",
      version: "0.1",
      author: "@annasob, Matthew Schranz @mjschranz",
      website: "annasob.wordpress.com, http://github.com/mjschranz",
      attribution: "Map tiles by <a target=\"_blank\" href=\"http://stamen.com\">Stamen Design</a>," +
        "under <a target=\"_blank\" href=\"http://creativecommons.org/licenses/by/3.0\">CC BY 3.0</a>. " +
        "Data by <a target=\"_blank\" href=\"http://openstreetmap.org\">OpenStreetMap</a>, " +
        "under <a target=\"_blank\" href=\"http://creativecommons.org/licenses/by-sa/3.0\">CC BY SA</a>."
    },
    options: {
      start: {
        elem: "input",
        type: "number",
        label: "Start",
        "units": "seconds"
      },
      end: {
        elem: "input",
        type: "number",
        label: "End",
        "units": "seconds"
      },
      type: {
        elem: "select",
        options: [ "Road Map", "Satellite", "Street View", "Hybrid", "Terrain", "Stamen - Water Color", "Stamen - Terrain", "Stamen - Toner" ],
        values: [ "ROADMAP", "SATELLITE", "STREETVIEW", "HYBRID", "TERRAIN", "STAMEN-WATERCOLOR", "STAMEN-TERRAIN", "STAMEN-TONER" ],
        label: "Map Type",
        "default": "ROADMAP",
        optional: true
      },
      location: {
        elem: "input",
        type: "text",
        label: "Location",
        "default": "Toronto, Ontario, Canada"
      },
      fullscreen: {
        elem: "input",
        type: "checkbox",
        label: "Full-Screen",
        "default": false,
        optional: true
      },
      heading: {
        elem: "input",
        type: "number",
        label: "Heading",
        "default": 0,
        optional: true
      },
      pitch: {
        elem: "input",
        type: "number",
        label: "Pitch",
        "default": 1,
        optional: true
      },
      zoom: {
        elem: "input",
        type: "number",
        label: "Zoom",
        "default": 10,
        optional: true
      },
      transition: {
        elem: "select",
        options: [ "None", "Pop", "Fade", "Slide Up", "Slide Down" ],
        values: [ "popcorn-none", "popcorn-pop", "popcorn-fade", "popcorn-slide-up", "popcorn-slide-down" ],
        label: "Transition",
        "default": "popcorn-fade"
      },
      left: {
        elem: "input",
        type: "number",
        label: "Left",
        units: "%",
        "default": 15,
        hidden: true
      },
      top: {
        elem: "input",
        type: "number",
        label: "Top",
        units: "%",
        "default": 15,
        hidden: true
      },
      width: {
        elem: "input",
        type: "number",
        label: "Width",
        units: "%",
        "default": 70,
        hidden: true
      },
      height: {
        elem: "input",
        type: "number",
        label: "height",
        units: "%",
        "default": 70,
        hidden: true
      },
      lat: {
        elem: "input",
        type: "number",
        label: "Lat",
        optional: true,
        hidden: true
      },
      lng: {
        elem: "input",
        type: "number",
        label: "Lng",
        optional: true,
        hidden: true
      },
      zindex: {
        hidden: true
      }
    }
  });
}( Popcorn ));

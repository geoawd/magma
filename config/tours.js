// Add tours here without changing the map defaults in config/config.js.
// Each tour is { id, name, stops: [{ title, description, target, center, zoom,
// bearing, pitch, terrain, duration, theme, layers, popup }] }.
window.TOURS = [
  {
    id: 'geology-introduction',
    name: 'Geology introduction',
    stops: [
            {
        title: 'Geohazards Tour',
        description: 'Click the buttons to fly around the map and discover geohazards.',
        target: '#map',
        theme: "Site Investigations",
        layers: {
          overlays: ["lot1_ortho_ni","Boreholes"],
          hideOverlays: ["esri_world_imagery","Site Reports"]
        },
        center: [-5.97921, 55.05201],
        zoom: 14.34,
        bearing: -144.42,
        pitch: 76,
        terrain: true,
        duration: 5000
      },
            {
        title: 'Garron Point',
        description: 'This view shows the geology map overlain on the Terrain Model.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["lot1_ortho_ni","Boreholes","10K_linear","10K_bedrock"],
          hideOverlays: ["esri_world_imagery","Site Reports"]
        },
        center: [-5.97921, 55.05201],
        zoom: 14.34,
        bearing: -144.42,
        pitch: 76,
        terrain: true,
        duration: 1200
      },
            {
        title: 'Garron Point',
        description: 'Garron Point is one of the outstanding headlands on the Antrim coast, located in The Glens of Antrim.',
        target: '#map',
        theme: "Site Investigations",
        layers: {
          overlays: ["lot1_ortho_ni","Boreholes"],
          hideOverlays: ["esri_world_imagery","Site Reports"]
        },
        center: [-5.97138, 55.04831],
        zoom: 14.93,
        bearing: -140.73,
        pitch: 77,
        terrain: true,
        duration: 5000,
      },
            {
        title: 'New tour stop',
        description: ' It provides a scenic and distinctive backdrop for Red Bay and forms part of The Antrim Coast and Glens Area of Outstanding Natural Beauty.',
        target: '#map',
        theme: "Site Investigations",
        layers: {
          overlays: ["lot1_ortho_ni","Boreholes"],
          hideOverlays: ["esri_world_imagery","Site Reports"]
        },
        center: [-5.97125, 55.05109],
        zoom: 16.42,
        bearing: -163.62,
        pitch: 73.5,
        terrain: true,
        duration: 8000
      },
            {
        title: 'New tour stop',
        description: 'The name Garron comes from the Gaelic Gearr Rinn meaning cut or short headland and yet Moira O’Neill, the poetress of the Glens, is happy to refer to it in one her poems as ‘the long blue head of Garron from the sea’. ',
        target: '#map',
        theme: "Site Investigations",
        layers: {
          overlays: ["lot1_ortho_ni","Boreholes"],
          hideOverlays: ["esri_world_imagery","Site Reports"]
        },
        center: [-5.97201, 55.0515],
        zoom: 16.37,
        bearing: 155.67,
        pitch: 64.5,
        terrain: true,
        duration: 8000
      },
      /**
            {
        title: 'Video explanation',
        description: 'Garron Point is also affectionately known as the Magpie Coast thanks to its distinctive limestone and basalt strips. Watch a short explanation of the geological setting.',
        target: '#map',
        popup: {
          lngLat: [-5.97201, 55.0515],
          html: '<video controls width="320" src="media/video.mp4"></video>'
        }
      },
      */
    ]
  }
];



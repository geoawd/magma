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
  },
  {
    id: 'Coastal Sites',
    name: 'Coastal Sites',
    stops: [
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.11436, 54.05103],
        zoom: 13.57,
        bearing: 90.39,
        pitch: 44.63,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-5.89141, 54.15104],
        zoom: 14.1,
        bearing: -15.97,
        pitch: 77,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-5.85752, 54.22912],
        zoom: 14,
        bearing: -139.21,
        pitch: 73.49,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-5.83548, 54.7622],
        zoom: 10.05,
        bearing: -79.15,
        pitch: 63.51,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-5.97224, 55.04369],
        zoom: 14.12,
        bearing: -89.53,
        pitch: 56.51,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-5.97326, 55.05008],
        zoom: 15.32,
        bearing: -161.57,
        pitch: 71.07,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.05692, 55.06907],
        zoom: 12.95,
        bearing: -162.85,
        pitch: 58.07,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.0629, 55.19586],
        zoom: 16.03,
        bearing: -102.79,
        pitch: 75.5,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.12712, 55.21642],
        zoom: 15.8,
        bearing: -69.76,
        pitch: 78,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.14125, 55.22509],
        zoom: 14.97,
        bearing: -116.25,
        pitch: 54.49,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.15669, 55.22232],
        zoom: 14.32,
        bearing: 127.75,
        pitch: 66.99,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.28996, 55.2263],
        zoom: 15.35,
        bearing: -175.28,
        pitch: 72.07,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.38496, 55.24079],
        zoom: 15.94,
        bearing: -145.49,
        pitch: 74.04,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.46264, 55.24621],
        zoom: 16.23,
        bearing: -89.45,
        pitch: 61.99,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.51032, 55.24],
        zoom: 16.71,
        bearing: 178.89,
        pitch: 73,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.53569, 55.22522],
        zoom: 14.9,
        bearing: 137.25,
        pitch: 31,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.76368, 55.16575],
        zoom: 13.98,
        bearing: 152.23,
        pitch: 39,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.94366, 55.14748],
        zoom: 11.69,
        bearing: 91.43,
        pitch: 38.51,
        terrain: true,
        duration: 1200
      },
            {
        title: 'New tour stop',
        description: 'Describe this stop.',
        target: '#map',
        theme: "Geology WMS",
        layers: {
          overlays: ["esri_world_imagery","lot1_ortho_ni"],
          hideOverlays: ["10K_bedrock","10K_superficial","10K_linear","10K_mass_movement","10K_artificial","10K_landform","250K_bedrock","250K_superficial","250K_linear"]
        },
        center: [-6.42538, 54.77582],
        zoom: 8.14,
        bearing: 0,
        pitch: 0.22,
        terrain: false,
        duration: 1200
      }

  ]
  }
];
export interface CameraObservationRecord {
  camera_id: string;
  timestamp: string;
  frame_id: string;
  object_detected: string;
  object_type: string;
  confidence: number;
  bounding_box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  location?: {
    lat: number;
    lon: number;
  };
}

export interface CameraObservationSource {
  source_id: string;
  source_type: "camera_feed";
  name: string;
  location_lat: number;
  location_lon: number;
}

export interface CameraObservationSourceConfig {
  source_type: "camera_feed";
}

export interface CameraObservationNormalizationContext {
  default_timestamp: string;
  processed_at: string;
}

export interface CameraBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CameraLocation {
  lat: number;
  lon: number;
}

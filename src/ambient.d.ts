interface Window {
  __ready: boolean;
  __frame: (name: 'far' | 'near') => void;
  __debug: () => {
    azimuth: number;
    polar: number;
    distance: number;
    target: { x: number; y: number; z: number };
    hdr: boolean;
  };
}

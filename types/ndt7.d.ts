declare module "@m-lab/ndt7" {
  export type Measurement = {
    ElapsedTime?: number;
    NumBytes?: number;
    MeanClientMbps?: number;
    TCPInfo?: {
      MinRTT?: number;
      RTT?: number;
      RTTVar?: number;
      BytesSent?: number;
      BytesRetrans?: number;
      TotalRetrans?: number;
      ElapsedTime?: number;
      BusyTime?: number;
      RWndLimited?: number;
      SndBufLimited?: number;
      SndCwnd?: number;
      PacingRate?: number;
      PMTU?: number;
    };
    BBRInfo?: { MinRTT?: number };
    ConnectionInfo?: { Client?: string; Server?: string; UUID?: string };
  };

  export type MeasurementEvent = { Source: "client" | "server"; Data: Measurement };
  export type Server = {
    machine?: string;
    location?: { city?: string; country?: string };
  };

  export type Callbacks = {
    error?: (message: string | Error) => void;
    serverDiscovery?: () => void;
    serverChosen?: (server: Server) => void;
    downloadStart?: () => void;
    downloadMeasurement?: (event: MeasurementEvent) => void;
    downloadComplete?: () => void;
    uploadStart?: () => void;
    uploadMeasurement?: (event: MeasurementEvent) => void;
    uploadComplete?: () => void;
  };

  const ndt7: {
    test: (config: Record<string, unknown>, callbacks: Callbacks) => Promise<number>;
    discoverServerURLs: (config: Record<string, unknown>, callbacks: Callbacks) => Promise<Record<string, string>>;
    downloadTest: (config: Record<string, unknown>, callbacks: Callbacks, urls: Promise<Record<string, string>>) => Promise<number>;
    uploadTest: (config: Record<string, unknown>, callbacks: Callbacks, urls: Promise<Record<string, string>>) => Promise<number>;
  };
  export default ndt7;
}

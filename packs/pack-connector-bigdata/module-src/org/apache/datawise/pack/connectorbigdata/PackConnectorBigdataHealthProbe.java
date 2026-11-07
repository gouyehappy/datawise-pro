package org.apache.datawise.pack.connectorbigdata;

public final class PackConnectorBigdataHealthProbe {

    public String status() {
        return "ok";
    }

    public String packId() {
        return "pack.connector.bigdata";
    }
}

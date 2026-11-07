package org.apache.datawise.backend.domain.pack;

/** Site-level free AI call meter for Standard edition (no pack.ai). */
public record AiFreeUsageDocument(String day, int calls) {

    public static AiFreeUsageDocument empty(String day) {
        return new AiFreeUsageDocument(day != null ? day : "", 0);
    }
}

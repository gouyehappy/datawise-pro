package org.apache.datawise.sqlflow.tree.literal;

import org.apache.datawise.sqlflow.AstVisitor;
import org.apache.datawise.sqlflow.parser.ParsingException;
import org.apache.datawise.sqlflow.tree.Node;
import org.apache.datawise.sqlflow.tree.NodeLocation;

import com.google.common.io.BaseEncoding;

import java.util.Arrays;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

import static java.util.Locale.ENGLISH;
import static java.util.Objects.requireNonNull;

public class BinaryLiteral extends Literal {

    private static final Pattern WHITESPACE_PATTERN = Pattern.compile("[ \\r\\n\\t]");
    private static final Pattern NOT_HEX_DIGIT_PATTERN = Pattern.compile(".*[^A-F0-9].*");

    private final byte[] value;

    public BinaryLiteral(String value) {
        this(Optional.empty(), value);
    }

    public BinaryLiteral(Optional<NodeLocation> location, String value) {
        super(location);
        requireNonNull(value, "value is null");
        String hexString = WHITESPACE_PATTERN.matcher(value).replaceAll("").toUpperCase(ENGLISH);
        if (NOT_HEX_DIGIT_PATTERN.matcher(hexString).matches()) {
            throw new ParsingException("Binary literal can only contain hexadecimal digits", location.orElse(null));
        }
        if (hexString.length() % 2 != 0) {
            throw new ParsingException("Binary literal must contain an even number of digits", location.orElse(null));
        }
        this.value = BaseEncoding.base16().decode(hexString);
    }

    public BinaryLiteral(NodeLocation location, String value) {
        this(Optional.of(location), value);
    }

    public String toHexString() {
        return BaseEncoding.base16().encode(value);
    }

    public byte[] getValue() {
        return value;
    }

    @Override
    public <R, C> R accept(AstVisitor<R, C> visitor, C context) {
        return visitor.visitBinaryLiteral(this, context);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || getClass() != o.getClass()) {
            return false;
        }
        BinaryLiteral that = (BinaryLiteral) o;
        return Arrays.equals(value, that.value);
    }

    @Override
    public int hashCode() {
        return Arrays.hashCode(value);
    }

    @Override
    public boolean shallowEquals(Node other) {
        if (!Node.sameClass(this, other)) {
            return false;
        }
        return Arrays.equals(value, ((BinaryLiteral) other).value);
    }
}

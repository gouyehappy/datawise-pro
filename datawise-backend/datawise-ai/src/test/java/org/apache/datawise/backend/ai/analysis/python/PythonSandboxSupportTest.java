package org.apache.datawise.backend.ai.analysis.python;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PythonSandboxSupportTest {

    @Test
    void blocksDangerousImports() {
        assertTrue(PythonSandboxSupport.validateUserCode("import os").isPresent());
    }

    @Test
    void allowsSafeAnalysisCode() {
        assertFalse(PythonSandboxSupport.validateUserCode("print(len(rows))").isPresent());
    }

    @Test
    void blocksReadingHostFiles() {
        assertTrue(PythonSandboxSupport.validateUserCode(
                "print(open('/etc/passwd').read())").isPresent());
    }

    @Test
    void blocksTheDunderEscapeChain() {
        assertTrue(PythonSandboxSupport.validateUserCode(
                "print(().__class__.__bases__[0].__subclasses__())").isPresent());
        assertTrue(PythonSandboxSupport.validateUserCode(
                "print((1).__class__.__init__.__globals__)").isPresent());
    }

    @Test
    void blocksIndirectBuiltinLookup() {
        assertTrue(PythonSandboxSupport.validateUserCode(
                "print(getattr(__builtins__, 'open')('/etc/passwd').read())").isPresent());
    }

    @Test
    void blocksProcessAndThreadModules() {
        assertTrue(PythonSandboxSupport.validateUserCode("import multiprocessing").isPresent());
        assertTrue(PythonSandboxSupport.validateUserCode("from threading import Thread").isPresent());
    }

    @Test
    void stillAllowsOrdinaryDataframeWork() {
        assertFalse(PythonSandboxSupport.validateUserCode("""
                total = df['amount'].sum()
                grouped = df.groupby('region').agg({'amount': 'mean'})
                print(grouped.head(10).to_string())
                """).isPresent());
    }
}

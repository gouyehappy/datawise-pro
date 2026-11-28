//go:build !windows

package main

func namedPipeSupported() bool { return false }

"""Code shared by backendN and backendO.

This package is duplicated byte-for-byte in both backends so each folder
deploys on its own (Vercel for N1/N2, Render for O1/O2). Edit it in one
backend, copy it to the other; tests/test_common_in_sync.py fails if the
copies drift.
"""

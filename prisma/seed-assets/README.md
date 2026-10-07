# Seed assets

## abdomen-ultrasound-seed.dcm

A real, readable DICOM study attached to the demonstration facility's abdominal
ultrasound report, so the built-in viewer opens an actual image rather than
reporting that it only holds metadata.

**It is synthetic.** The pixels are generated, not recorded: there is no patient
behind this study, which is the only kind of image that belongs in a repository
or on a demonstration instance that anybody can sign into.

Deliberately a multi-frame ultrasound, because that exercises the parts of the
viewer most likely to be wrong — frame decoding, the cine controls, and the
window it opens on — rather than a single flat image that would look right even
if those were broken.

Stored uncompressed (Explicit VR Little Endian), which is one of the two transfer
syntaxes the viewer decodes. If this file is ever replaced, the replacement must
be uncompressed or JPEG Baseline, or the demo will show the viewer's refusal
message instead of a picture.

all:

# this is a very custom installer which uploads rxweb to the one place
# where rxweb should be in perkeep
install:
	pk-put attr sha224-eb64d38bc55eb20204d235560fb33488f8473c3f08f60f0cb274a240 camliContent `pk-put file rxweb.js`
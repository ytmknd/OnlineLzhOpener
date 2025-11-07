var unlzh;
(function() {"use strict";
/* stdlib.h */
var EXIT_SUCCESS = 0;
var EXIT_FAILURE = 1;

function exit(v) {
	throw v;
}

/* stdio.h */
var stdout = stdio.stdout;
var stderr = stdio.stderr;
var fopen = stdio.fopen;

/* limits.h */
var CHAR_BIT = 8;
var UCHAR_MAX = 255;
var ULONG_MAX = 4294967295;

/* ar.c */

var origsize, compsize;

/* io.c */

var INIT_CRC = 0;  /* CCITT: 0xFFFF */
var arcfile, outfile;
var crc, bitbuf;
var BITBUFSIZ = CHAR_BIT * 2/* sizeof bitbuf */;

var error;
var make_crctable;
var fillbuf;
var getbits;
var fread_crc;
var fwrite_crc;
var init_getbits;

(function() {

var CRCPOLY = 0xA001;  /* ANSI CRC-16 */
                       /* CCITT: 0x8408 */
function UPDATE_CRC(c) {
	crc = crctable[(crc ^ (c)) & 0xFF] ^ (crc >>> CHAR_BIT);
}

var crctable = [UCHAR_MAX + 1];
var subbitbuf;
var bitcount;

error = function() {
	var args = arguments;

//IE9 Platform Preview 4 (version 1.9.7916.6000)で開発者ツールを開くとエラーになる
	console.log(args[0]);
	exit(EXIT_FAILURE);
}

make_crctable = function() {
	var i, j, r;

	for (i = 0; i <= UCHAR_MAX; i++) {
		r = i;
		for (j = 0; j < CHAR_BIT; j++)
			if (r & 1) r = (r >>> 1) ^ CRCPOLY;
			else       r >>>= 1;
		crctable[i] = r;
	}
}

fillbuf = function(n) { /* Shift bitbuf n bits left, read n bits */
	bitbuf = (bitbuf << n) & 0xFFFF;
	while (n > bitcount) {
		bitbuf |= (subbitbuf << (n -= bitcount)) & 0xFFFF;
		if (compsize != 0) {
			compsize--;  subbitbuf = arcfile.fgetc();
		} else subbitbuf = 0;
		bitcount = CHAR_BIT;
	}
	bitbuf |= subbitbuf >>> (bitcount -= n);
}

getbits = function(n) {
	var x;

    /*if (n == 0) return 0;*/
    /* The above line added 2003-03-02.
       unsigned bitbuf used to be 16 bits, but now it's 32 bits,
       and (bitbuf >> 32) is equivalent to (bitbuf >> 0) (per ECMA-262).
       Thanks: CheMaRy.
    */

	x = bitbuf >>> (BITBUFSIZ - n);  fillbuf(n);
	return x;
}

fread_crc = function(p, n, f) {
	var i;

	i = n = f.fread(p, n);  origsize += n;
	while (--i >= 0) UPDATE_CRC(p[n - i]);
	return n;
}

fwrite_crc = function(p, n, f) {
	var i = 0;

	if (f.fwrite(p, 1, n) < n) error("Unable to write");
	while (--n >= 0) UPDATE_CRC(p[i++]);
}

init_getbits = function() {
	bitbuf = 0;  subbitbuf = 0;  bitcount = 0;
	arcfile.dump();
	fillbuf(BITBUFSIZ);
}


})();

/* decode.c */

var DICBIT = 13;    /* 12(-lh4-), 13(-lh5-), or 15(-lh6-) */
var DICSIZ = 1 << DICBIT;
var MAXMATCH = 256; /* formerly F (not more than UCHAR_MAX + 1) */
var THRESHOLD = 3;  /* choose optimal value */

function init_dicbit(dicbit) {
	DICBIT = dicbit;
	DICSIZ = 1 << dicbit;
}

var decode_start;
var decode;

/* maketbl.c */
var make_table;

(function() {

make_table = function(nchar, bitlen, tablebits, table) {
	var count = [17], weight = [17], start = [18], p, l;
	var i, k, len, ch, jutbits, avail, nextcode, mask;

	for (i = 1; i <= 16; i++) count[i] = 0;
	for (i = 0; i < nchar; i++) count[bitlen[i]]++;

	start[1] = 0;
	for (i = 1; i <= 16; i++)
		start[i + 1] = (start[i] + (count[i] << (16 - i))) & 0xFFFF;
	if (start[17] != ((1 << 16) & 0xFFFF)) error("Bad table");

	jutbits = 16 - tablebits;
	for (i = 1; i <= tablebits; i++) {
		start[i] >>>= jutbits;
		weight[i] = 1 << (tablebits - i);
	}
	while (i <= 16) {
		weight[i] = 1 << (16 - i);  i++;
	}
    /* Note: in the 1990 version of ar002, the above three lines
       were:
           while (i <= 16) weight[i++] = 1U << (16 - i);
       but that doesn't work as expected per ECMA-262. */

	i = start[tablebits + 1] >>> jutbits;
	if (i != ((1 << 16) & 0xFFFF)) {
		k = 1 << tablebits;
		while (i != k) table[i++] = 0;
	}

	avail = nchar;
	mask = 1 << (15 - tablebits);
	for (ch = 0; ch < nchar; ch++) {
		if ((len = bitlen[ch]) == 0) continue;
		nextcode = start[len] + weight[len];
		if (len <= tablebits) {
			for (i = start[len]; i < nextcode; i++) table[i] = ch;
		} else {
			k = start[len];
			p = table, l = k >>> jutbits;
			i = len - tablebits;
			while (i != 0) {
				if (p[l] == 0) {
					right[avail] = left[avail] = 0;
					p[l] = avail++;
				}
				if (k & mask) l = p[l], p = right;
				else          l = p[l], p = left;
				k <<= 1;  i--;
			}
			p[l] = ch;
		}
		start[len] = nextcode;
	}
}

})();

var decode_start_fix;

(function() {

var N_CHAR     = (256 + 60 - THRESHOLD + 1);
var TREESIZE_C = (N_CHAR * 2);
var TREESIZE_P = (128 * 2);
var TREESIZE   = (TREESIZE_C + TREESIZE_P);
var ROOT_C     = 0;

var n_max;
var child  = [TREESIZE],
	parent = [TREESIZE],
	block  = [TREESIZE],
	edge   = [TREESIZE],
	stock  = [TREESIZE],
	node   = [TREESIZE / 2];
var freq = [TREESIZE];
var avail, n1;
var np;
var pt_len = [], pt_code = [];
var pt_table = [256];
var maxmatch;

var fixed = [
	[3, 0x01, 0x04, 0x0c, 0x18, 0x30, 0],				/* old compatible */
	[2, 0x01, 0x01, 0x03, 0x06, 0x0D, 0x1F, 0x4E, 0]	/* 8K buf */
];

/* shuf.c */

function ready_made(method) {
	var i, j;
	var code, weight;
	var tbl, pos;

	tbl = fixed[method];
	pos = 0;
	j = tbl[pos++];
	weight = 1 << (16 - j);
	code = 0; 
	for (i = 0; i < np; i++) {
		while (tbl[pos] == i) {
			j++;
			pos++;
			weight >>= 1;
		}
		pt_len[i] = j;
		pt_code[i] = code;
		code += weight;
	}
}

decode_start_fix = function() {
	decode_c = decode_c_dyn;
	decode_p = decode_p_st0;
	n_max = 314;
	maxmatch = 60;
	init_getbits();
	np = 1 << (12 - 6);
	start_c_dyn();
	ready_made(0);
	make_table(np, pt_len, 8, pt_table);
}

function decode_p_st0() {
	var i, j;

	j = pt_table[bitbuf >>> 8];
	if (j < np) {
		fillbuf(pt_len[j]);
	} else {
		fillbuf(8); i = bitbuf;
		do {
			if (i & 0x8000) j = right[j];
			else            j = left [j];
			i <<= 1;
		} while (j >= np);
		fillbuf(pt_len[j] - 8);
	}
	return (j << 6) + getbits(6);
}

/* dhuf.c */

function start_c_dyn() {
	var i, j, f;

	n1 = (n_max >= 256 + maxmatch - THRESHOLD + 1) ? 512 : n_max - 1;
	for (i = 0; i < TREESIZE_C; i++) {
		stock[i] = i;
		block[i] = 0;
	}
	for (i = 0, j = n_max * 2 - 2; i < n_max; i++, j--) {
		freq[j] = 1;
		child[j] = ~i;
		node[i] = j;
		block[j] = 1;
	}
	avail = 2;
	edge[1] = n_max - 1;
	i = n_max * 2 - 2;
	while (j >= 0) {
		f = freq[j] = freq[i] + freq[i - 1];
		child[j] = i;
		parent[i] = parent[i - 1] = j;
		if (f == freq[j + 1]) {
			edge[block[j] = block[j + 1]] = j;
		} else {
			edge[block[j] = stock[avail++]] = j;
		}
		i -= 2;
		j--;
	}
}

function reconst(start, end) {
	var i, j, k, l, b;
	var f, g;

	for (i = j = start; i < end; i++) {
		if ((k = child[i]) < 0) {
			freq[j] = (freq[i] + 1) / 2;
			child[j] = k;
			j++;
		}
		if (edge[b = block[i]] == i) {
			stock[--avail] = b;
		}
	}
	j--;
	i = end - 1;
	l = end - 2;
	while (i >= start) {
		while (i >= l) {
			freq[i] = freq[j]; child[i] = child[j];
			i--, j--;
		}
		f = freq[l] + freq[l + 1];
		for (k = start; f < freq[k]; k++);
		while(j >= k) {
			freq[i] = freq[j]; child[i] = child[j];
			i--, j--;
		}
		freq[i] = f; child[i] = l + 1;
		i--;
		l -= 2;
	}
	f = 0;
	for (i = start; i < end; i++) {
		if ((j = child[i]) < 0) node[~j] = i;
		else parent[j] = parent[j - 1] = i;
		if ((g = freq[i]) == f) {
			block[i] = b;
		} else {
			edge[b = block[i] = stock[avail++]] = i;
			f = g;
		}
	}
}

function swap_inc(p) {
	var b, q, r, s;

	b = block[p];
	if ((q = edge[b]) != p) {	/* swap for leader */
		r = child[p]; s = child[q];
		child[p] = s; child[q] = r;
		if (r >= 0) parent[r] = parent[r - 1] = q;
		else		node[~r] = q;
		if (s >= 0)	parent[s] = parent[s - 1] = p;
		else		node[~s] = p;
		p = q;

		edge[b]++;
		if (++freq[p] == freq[p - 1]) {
			block[p] = block[p - 1];
		} else {
			edge[block[p] = stock[avail++]] = p;	/* create block */
		}
	} else if (b == block[p + 1]) {
		edge[b]++;
		if (++freq[p] == freq[p - 1]) {
			block[p] = block[p - 1];
		} else {
			edge[block[p] = stock[avail++]] = p;	/* create block */
		}
	} else if (++freq[p] == freq[p - 1]) {
		stock[--avail] = b;		/* delete block */
		block[p] = block[p - 1];
	}
	return parent[p];
}

function update_c(p) {
	var q;

	if (freq[ROOT_C] == 0x8000) {
		reconst(0, n_max * 2 - 1);
	}
	freq[ROOT_C]++;
	q = node[p];
	do {
		q = swap_inc(q);
	} while (q != ROOT_C);
}

function decode_c_dyn() {
	var c;
	var buf, cnt;

	c = child[ROOT_C];
	buf = bitbuf;
	cnt = 0;
	do {
		c = child[c - (buf & 0x8000 ? 1 : 0)];
		buf <<= 1;
		if (++cnt == 16) {
			fillbuf(16);
			buf = bitbuf; cnt = 0;
		}
	} while (c > 0);
	fillbuf(cnt);
	c = ~c;
	update_c(c);
	if (c == n1) c += getbits(8);
	return c;
}

})();

/* huf.c */

var NC = (UCHAR_MAX + MAXMATCH + 2 - THRESHOLD);
	/* alphabet = {0, 1, 2, ..., NC - 1} */
var CBIT = 9;  /* $\lfloor \log_2 NC \rfloor + 1$ */
var CODE_BIT = 16;  /* codeword length */

var left = [2 * NC - 1], right = [2 * NC - 1];

var decode_start_st1;
var decode_c;
var decode_p;

(function() {

var NP = (DICBIT + 1);
var NT = (CODE_BIT + 3);
var PBIT = 4;  /* smallest integer such that (1 << PBIT) > NP */
var TBIT = 5;  /* smallest integer such that (1 << TBIT) > NT */
if (NT > NP)
	var NPT = NT;
else
	var NPT = NP;

var c_len = [NC], pt_len = [NPT];
var   blocksize;
var c_table = [4096], pt_table = [256];

/***** decoding *****/

function read_pt_len(nn, nbit, i_special) {
	var i, c, n;
	var mask;

	n = getbits(nbit);
	if (n == 0) {
		c = getbits(nbit);
		for (i = 0; i < nn; i++) pt_len[i] = 0;
		for (i = 0; i < 256; i++) pt_table[i] = c;
	} else {
		i = 0;
		while (i < n) {
			c = bitbuf >>> (BITBUFSIZ - 3);
			if (c == 7) {
				mask = 1 << (BITBUFSIZ - 1 - 3);
				while (mask & bitbuf) {  mask >>>= 1;  c++;  }
			}
			fillbuf((c < 7) ? 3 : c - 3);
			pt_len[i++] = c;
			if (i == i_special) {
				c = getbits(2);
				while (--c >= 0) pt_len[i++] = 0;
			}
		}
		while (i < nn) pt_len[i++] = 0;
		make_table(nn, pt_len, 8, pt_table);
	}
}

function read_c_len() {
	var i, c, n;
	var mask;

	n = getbits(CBIT);
	if (n == 0) {
		c = getbits(CBIT);
		for (i = 0; i < NC; i++) c_len[i] = 0;
		for (i = 0; i < 4096; i++) c_table[i] = c;
	} else {
		i = 0;
		while (i < n) {
			c = pt_table[bitbuf >>> (BITBUFSIZ - 8)];
			if (c >= NT) {
				mask = 1 << (BITBUFSIZ - 1 - 8);
				do {
					if (bitbuf & mask) c = right[c];
					else               c = left [c];
					mask >>>= 1;
				} while (c >= NT);
			}
			fillbuf(pt_len[c]);
			if (c <= 2) {
				if      (c == 0) c = 1;
				else if (c == 1) c = getbits(4) + 3;
				else             c = getbits(CBIT) + 20;
				while (--c >= 0) c_len[i++] = 0;
			} else c_len[i++] = c - 2;
		}
		while (i < NC) c_len[i++] = 0;
		make_table(NC, c_len, 12, c_table);
	}
}

function decode_c_st1() {
	var j, mask;

	if (blocksize == 0) {
		blocksize = getbits(16);
		read_pt_len(NT, TBIT, 3);
		read_c_len();
		read_pt_len(NP, PBIT, -1);
	}
	blocksize--;
	j = c_table[bitbuf >>> (BITBUFSIZ - 12)];
	if (j >= NC) {
		mask = 1 << (BITBUFSIZ - 1 - 12);
		do {
			if (bitbuf & mask) j = right[j];
			else               j = left [j];
			mask >>>= 1;
		} while (j >= NC);
	}
	fillbuf(c_len[j]);
	return j;
}

function decode_p_st1() {
	var j, mask;

	j = pt_table[bitbuf >>> (BITBUFSIZ - 8)];
	if (j >= NP) {
		mask = 1 << (BITBUFSIZ - 1 - 8);
		do {
			if (bitbuf & mask) j = right[j];
			else               j = left [j];
			mask >>>= 1;
		} while (j >= NP);
	}
	fillbuf(pt_len[j]);
	if (j != 0) j = (1 << (j - 1)) + getbits(j - 1);
	return j;
}

decode_start_st1 = function() {
	decode_c = decode_c_st1;
	decode_p = decode_p_st1;
	NP = (DICBIT + 1);
	PBIT = (NP < 16) ? 4 : 5;
	init_getbits();  blocksize = 0;
}

})();

(function() {

var j;  /* remaining bytes to copy */

decode_start = function(method) {
	switch (method) {
	case '-lh1-':
		init_dicbit(12);
		decode_start_fix();
		break;
	case '-lh4-':
	case '-lh5-':
	case '-lh6-':
		init_dicbit(method == '-lh6-' ? 15 : 13);
		decode_start_st1();
		break;
	}
	j = 0;
};

	var i;
decode = function(count, buffer) {
	/* The calling function must keep the number of
	   bytes to be processed.  This function decodes
	   either 'count' bytes or 'DICSIZ' bytes, whichever
	   is smaller, into the array 'buffer[]' of size
	   'DICSIZ' or more.
	   Call decode_start() once for each new file
	   before calling this function. */
	var r, c;

	r = 0;
	while (--j >= 0) {
		buffer[r] = buffer[i];
		i = (i + 1) & (DICSIZ - 1);
		if (++r == count) return;
	}
	for ( ; ; ) {
		c = decode_c();
		if (c <= UCHAR_MAX) {
			buffer[r] = c;
			if (++r == count) return;
		} else {
			j = c - (UCHAR_MAX + 1 - THRESHOLD);
			i = (r - decode_p() - 1) & (DICSIZ - 1);
			while (--j >= 0) {
				buffer[r] = buffer[i];
				i = (i + 1) & (DICSIZ - 1);
				if (++r == count) return;
			}
		}
	}
};

})();

(function() {

var usage =
	"ar -- compression archiver -- written by Haruhiko Okumura\n" +
	"  PC-VAN:SCIENCE        CompuServe:74050,1022\n" +
	"  NIFTY-Serve:PAF01022  INTERNET:74050.1022@compuserve.com\n" +
	"Usage: ar command archive [file ...]\n" +
	"Commands:\n" +
	"   x: Extract files from archive\n" +
	"   p: Print files on standard output\n" +
	"   l: List contents of archive\n" +
	"If no files are named, all files in archive are processed.\n" +
	"You may copy, distribute, and rewrite this program freely.\n";

/***********************************************************

Structure of archive block (low order byte first):
-----preheader
 1	basic header size
		= 25 + strlen(filename) (= 0 if end of archive)
 1	basic header algebraic sum (mod 256)
-----basic header
 5	method ("-lh0-" = stored, "-lh5-" = compressed)
 4	compressed size (including extended headers)
 4	original size
 4	not used
 1	0x20
 1	0x01
 1	filename length (x)
 x	filename
 2	original file's CRC
 1	0x20
 2	first extended header size (0 if none)
-----first extended header, etc.
-----compressed file

***********************************************************/

var FNAME_MAX = 255 - 25;
var NAMELEN = 19;
var method;
var filename;
var ext_headersize;

var buffer = [DICSIZ];
var header = [];
var headersize, headersum;
var header_level;
var file_crc;
var os;

function ratio(a, b) {  /* [(1000a + [b/2]) / b] */
	var i;

	for (i = 0; i < 3; i++)
		if (a <= ULONG_MAX / 10) a *= 10;  else b /= 10;
	if (a + (b >>> 1) < a) {  a >>>= 1;  b >>>= 1;  }
	if (b == 0) return 0;
	return (a + (b >>> 1)) / b;
}

function get_from_header(i, n) {
	var s = 0;
	while (--n >= 0) s = (s << 8) + header[i + n];  /* little endian */
	return s;
}

function calc_headersum() {
	var s = 0;
	for (var i = 0; i < headersize; i++) s += header[i];
	return s & 0xFF;
}

function find_header() {
	var current_pos = 3;
	for (;;) {
		try {
			if (read_header()) {
				return;
			}
		} catch (e) {
		}
		arcfile.fseek(current_pos, stdio.SEEK_SET);
		var c;
		while ((c = arcfile.fgetc()) != 0x2d) {
		  if (c < 0) error("No header found. Probably not an LZH archive.");
		}
		current_pos = arcfile.ftell();
		arcfile.fseek(-3, stdio.SEEK_CUR);
	}
}

function read_header() {
	headersize = arcfile.fgetc();
	if (headersize <= 0) return 0;  /* EOF or end of archive */
	headersum  = arcfile.fgetc();
	header = [];
	if (fread_crc(header, 19, arcfile) < 19) {  /* CRC not used */
		logerror("Unexpected EOF");
		return 0;
	}
	header_level = get_from_header(18, 1);
	var extra = [];
	var crc_pos;
	if (header_level < 2) {
		fread_crc(extra, headersize-19, arcfile);  /* CRC not used */
		header = header.concat(extra);
		if (calc_headersum() != headersum) error("Header sum error");
		crc_pos = 20 + get_from_header(19, 1);
	} else if (header_level == 2) {
		headersize = 24;
		fread_crc(extra, 5, arcfile);  /* CRC not used */
		header = header.concat(extra);
		crc_pos = 19;
	} else {
		error("Unknown header level: " + header_level);
	}
	method = String.fromCharCode.apply(null, header.slice(0, 5))
	compsize = get_from_header(5, 4);
	origsize = get_from_header(9, 4);
	file_crc = get_from_header(crc_pos, 2);
	if (header_level > 0 || headersize > crc_pos + 2) {
		os = String.fromCharCode(get_from_header(crc_pos + 2, 1));
	} else {
		os = 'M';
	}
	if (header_level < 2) {
		filename = String.fromCharCode.apply(null, header.slice(20, 20 + header[NAMELEN]));
	}
	var dirname = "";
	ext_headersize = header_level == 0 ? 0 : get_from_header(headersize - 2, 2);
	while (ext_headersize > 0) {
		if (header_level < 2) compsize -= ext_headersize;
		var ext_id = arcfile.fgetc();
		if (ext_id == 1) {
			extra = [];
			arcfile.fread(extra, ext_headersize - 3, arcfile);
			filename = String.fromCharCode.apply(null, extra);
		} else if (ext_id == 2) {
			extra = [];
			arcfile.fread(extra, ext_headersize - 3, arcfile);
			dirname = String.fromCharCode.apply(null, extra).split('\xff').join('\\');
		} else if (arcfile.fseek(ext_headersize - 3, stdio.SEEK_CUR)) {
			error("Can't read");
        }
		ext_headersize = arcfile.fgetc();
		ext_headersize += arcfile.fgetc() << 8;
	}
	if (ext_headersize < 0) {
		logerror("Unexpected EOF while reading ext headers");
		return 0;
	}
	filename = dirname + filename;
	return 1;  /* success */
}

function skip() {
	arcfile.fseek(compsize, stdio.SEEK_CUR);
}

function get_line(s, n) {
	var i, c;

	i = 0;
	while ((c = getchar()) != EOF && c != '\n')
		if (i < n) s[i++] = c;
	s[i] = '\0';
	return i;
}

function extract(to_file, out) {
	var n;

	if (out) {
		outfile = out;
	} else if (to_file) {
		while ((outfile = fopen(filename, "wb")) == null) {
			fprintf(stderr, "Can't open %s\nNew filename: ", filename);
			if (get_line(filename, FNAME_MAX) == 0) {
				fprintf(stderr, "Not extracted\n");
				skip();  return;
			}
			if (header_level < 2) header[NAMELEN] = strlen(filename);
		}
		log("Extracting " + filename + " ");
	} else {
		outfile = stdout;
		log("===== " + filename + " =====\n");
	}
	crc = INIT_CRC;
	if (!method.match(/-lh[01456]-/)) {
		logerror("Unknown method: " + method + "\n");
		skip();
	} else {
		crc = INIT_CRC;
		if (method != '-lh0-') {
			decode_start(method);
		}
		while (origsize != 0) {
			n = (origsize > DICSIZ) ? DICSIZ : origsize;
			if (method != '-lh0-') decode(n, buffer);
			else if (arcfile.fread(buffer, n) != n)
				error("Can't read");
			fwrite_crc(buffer, n, outfile);
			//if (outfile != stdout) logerror('.');
			origsize -= n;
		}
	}
	if (to_file) outfile.fclose();  else outfile = null;
	log("\n");
	if ((crc ^ INIT_CRC) != file_crc)
		logerror("CRC error\n");
}

function list_start() {
	log("Filename Original Compressed Ratio CRC Method\n");
}

function list() {
	var r;

	log(filename);
	if (filename.length > 14) printf("\n              ");
	r = ratio(compsize, origsize);
	log(" " + origsize + " " + compsize + " " + Math.floor(r) / 1000 + " " + file_crc.toString(16) + " " + String.fromCharCode.apply(null, header.slice(0, 5)) + "\n");
}

function match(s1, s2) {
	var i = 0, j = 0;

	s1 = s1.split(''); s1.push(0);
	s2 = s2.split(''); s2.push(0);
	for ( ; ; ) {
		while (s2[j] == '*' || s2[j] == '?') {
			if (s2[j++] == '*')
				while (s1[i] && s1[i] != s2[j]) i++;
			else if (s1[i] == 0)
				return 0;
			else i++;
		}
		if (s1[i] != s2[j]) return 0;
		if (s1[i] == 0    ) return 1;
		i++;  j++;
	}
}

function search(argc, argv) {
	var i;

	if (argc == 3) return 1;
	for (i = 3; i < argc; i++)
		if (match(filename, argv[i])) return 1;
	return 0;
}

function exitfunc() {
	outfile.fclose();
}

unlzh = function(argv, fn, end_fn) {
//try {
	argv.unshift(null);
	var argc = argv.length;
	var i, j, cmd, count, nfiles, found, done;

	/* Check command line arguments. */
	if (argc < 3
	 || argv[1].length > 1
	 || "XPL".indexOf(cmd = argv[1].toUpperCase()) < 0)
		error(usage);

	/* Wildcards used? */
	for (i = 3; i < argc; i++)
		if (argv[i].match(/[*?]/)) break;
	if (i < argc) nfiles = -1;  /* contains wildcards */
	else nfiles = argc - 3;     /* number of files to process */

	/* Open archive. */
	if (argv[2] instanceof stdio.FILE) {
		next(argv[2]);
	} else {
		fopen(argv[2], "rb", next);
	}
	function next(fp) {
		arcfile = fp;
		if (arcfile == null)
			error("Can't open archive '" + argv[2] + "'");
	
		make_crctable();  count = done = 0;
	
		for (find_header(); !done; done = done || !read_header()) {
			found = search(argc, argv);
			switch (cmd) {
			case 'X':  case 'P':
				if (found) {
					extract(cmd == 'X');
					if (++count == nfiles) done = 1;
				} else skip();
				break;
			case 'L':
				if (found) {
					if (count == 0) list_start();
					(fn || list)(arcfile, filename, method, compsize, origsize, file_crc, ext_headersize, os);
					if (++count == nfiles) done = 1;
				}
				skip();  break;
			}
		}
	
		log("  " + count + " files\n");
		if (end_fn) {
			end_fn();
		}
		return EXIT_SUCCESS;
	}
//} catch (e) { if (typeof e == 'number') return e; throw e; }
};

unlzh.extract = function(m, f) {
	arcfile = m.lzhfile;
	method = m.method;
	compsize = m.compsize;
	origsize = m.origsize;
	filename = m.filename;
	file_crc = m.file_crc;
	ext_headersize = m.ext_headersize;
	os = m.os;
	extract(false, f);
};
})();

function log(s) { stdout.fputs(s); }
function logerror(s) { stderr.fputs(s); }
//self.console = { log: function(){}, debug: function(){}, logerror: function(){} };
//Chromeでは追加したはずのlogerrorメソッドが消えてしまう場合がある。
//if (!logerror) logerror = console.log;
})();

const { spawn } = require('child_process');
const ls = spawn('ps', ['-a']);


var lines = ""
ls.stdout.on('data', (data) => {
    lines += data.toString();
  console.log(`stdout: ${data}`);
});

ls.stderr.on('data', (data) => {
  console.log(`stderr: ${data}`);
});


var numpids = 0;

if ( process.argv.length > 2 ) {
    numpids = parseInt(process.argv[2])
} else {
    console.log("Please supply one more command line argument = number of processes to kill")
    process.exit(0)
}


function killOff(n,pids) {
    for ( var i = 0; i < n; i++ ) {
        var reportD = (dpd) => {
            return( () => { console.log(`${dpd} done`); })
        }
        var kk = spawn('kill', ['-9', pids[i]]);
        kk.on('close', reportD(pids[i]) );
    }
}

ls.on('close', (code) => {
    console.log(lines)

    lines = lines.split('\n');
    var findLines = lines.filter(line => {
        if ( line.indexOf('start-agent.js') > 0 ) {
            return(true)
        }
        return(false)
    })

    console.log(findLines)

    var pids= findLines.map(line => {
        var ll = line.trim().split(' ')
        return(ll[0])
    })

    console.log(pids)
    killOff(numpids,pids)

});

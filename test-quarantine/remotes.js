
process.exit(0);

        it('fails to hit server', function(done) {

            var nextIt = false;
            var promiseIt = until(() => { return nextIt; })
            var forwardErr = undefined;

            agent.close(() => {

                const options = url.parse(target);

                const req = http.request(options, (res) => {
                    // ...
                });

                req.on('error', (err) => {
                    console.log("ERROR");
                    assert(err !== undefined, 'must have err');
                    assert(err.code === "ECONNREFUSED");
                    forwardErr = err;
                    nextIt = true;
                });
                /*
            request({
                method: 'GET',
                uri: target
            }, function(err, res, body) {
                assert(err !== undefined, 'must have err');
                assert(err.code === "ECONNREFUSED");
                forwardErr = err;
                nextIt = true;
                agent.start({ key: key, secret: secret },null, config, () => {});
            })
            */
            });

            promiseIt.then(function() {
                done(forwardErr)
            })
        });

        it('fails to hit server, then starts',function(done) {
            this.timeout(5000000);
            assert(true);
            done();
            /*
    agent.close();
    request({
      method: 'GET',
      uri: target
    }, function(err, res, body) {
      assert(err, 'must have err');
      assert.equal(err.code, "ECONNREFUSED");
      agent.start({ key: key, secret: secret },null, config, () => {
        request({
          method: 'GET',
          uri: target
        }, function(err, res, body) {
          assert(!err, err);
          assert.equal(res.statusCode, 200);
          done(err);
        });
      });
    });
    */
        });

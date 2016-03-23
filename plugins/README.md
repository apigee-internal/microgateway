#User Plugins
add your plugins here
must contain an init method which returns an object literal with all of the handlers

```javascript
{
  init:function(config,logger,stats){
    return {
    onrequest:function(req,res,[options],next){
    },
    ...
    }
  }
}
```

init method must return an object with handler methods for each event

the available handlers are 

* on_request
* ondata_request 
* onend_request
* on_response
* ondata_response
* onend_response
* onclose_response
* onerror_response

the handler signature will look like 

```javascript
function(sourceRequest,sourceResponse,[options],next){}
```
* sourceRequest: the request from the northbound server
* sourceResponse the response to the northbound server
* options: are the full scope of fields you might need to operate on.  
 
  ```javascript 
  	const options = {
      targetResponse: options.targetResponse,
      targetRequest: options.targetRequest,
      sourceRequest: options.sourceRequest,
      sourceResponse: options.sourceResponse,
      data: data
    };
    ```
* you must call next with an error if you errored out like

```javascript 
next([err])
```
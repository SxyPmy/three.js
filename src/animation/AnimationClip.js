/**
 *
 * Reusable set of Tracks that represent an animation.
 * 
 * @author Ben Houston / http://clara.io/
 * @author David Sarno / http://lighthaus.us/
 */

THREE.AnimationClip = function ( name, duration, tracks ) {

	this.name = name;
	this.tracks = tracks;
	this.duration = duration;

	// this means it should figure out its duration by scanning the tracks
	if( this.duration < 0 ) {
		for( var i = 0; i < this.tracks.length; i ++ ) {
			var track = this.tracks[i];
			this.duration = Math.max( track.keys[ track.keys.length - 1 ].time );
		}
	}

	// maybe only do these on demand, as doing them here could potentially slow down loading
	// but leaving these here during development as this ensures a lot of testing of these functions
	this.trim();
	this.optimize();

	this.results = [];
	
};

THREE.AnimationClip.prototype = {

	constructor: THREE.AnimationClip,

	getAt: function( clipTime ) {

		clipTime = Math.max( 0, Math.min( clipTime, this.duration ) );

		for( var i = 0; i < this.tracks.length; i ++ ) {

			var track = this.tracks[ i ];

			this.results[ i ] = track.getAt( clipTime );

		}

		return this.results;
	},

	trim: function() {

		for( var i = 0; i < this.tracks.length; i ++ ) {

			this.tracks[ i ].trim( 0, this.duration );

		}

		return this;

	},

	optimize: function() {

		for( var i = 0; i < this.tracks.length; i ++ ) {

			this.tracks[ i ].optimize();

		}

		return this;

	}

};


THREE.AnimationClip.CreateMorphAnimationFromNames = function( morphTargetNames, duration ) {

	var tracks = [];
	var frameStep = duration / morphTargetNames.length;

	for( var i = 0; i < morphTargetNames.length; i ++ ) {

		var keys = [];

		if( ( i - 1 ) >= 0 ) {

			keys.push( { time: ( i - 1 ) * frameStep, value: 0 } );

		}

		keys.push( { time: i * frameStep, value: 1 } );

		if( ( i + 1 ) <= morphTargetNames.length ) {

			keys.push( { time: ( i + 1 ) * frameStep, value: 0 } );

		}

		if( ( i - 1 ) < 0 ) {
			
			keys.push( { time: ( morphTargetNames.length - 1 ) * frameStep, value: 0 } );
			keys.push( { time: morphTargetNames.length * frameStep, value: 1 } );

		}

		var morphName = morphTargetNames[i];
		var trackName = '.morphTargetInfluences[' + morphName + ']';
		var track = new THREE.NumberKeyframeTrack( trackName, keys );

		tracks.push( track );
	}

	var clip = new THREE.AnimationClip( 'morphAnimation', duration, tracks );

	return clip;
};

THREE.AnimationClip.CreateMorphAnimation = function( morphTargets, duration ) {

	var morphTargetNames = [];

	for( var i = 0; i < morphTargets.length; i ++ ) {

		morphTargetNames.push( morphTargets[i].name );

	}

	return THREE.AnimationClip.CreateMorphAnimationFromNames( morphTargetNames, duration );

};


THREE.AnimationClip.FromImplicitMorphTargetAnimations = function( morphTargets, fps ) {
	
	var animations = {};
	var animationsArray = [];

	var pattern = /([a-z]+)_?(\d+)/;

	for ( var i = 0, il = morphTargets.length; i < il; i ++ ) {

		var morphTarget = morphTargets[ i ];
		var parts = morphTarget.name.match( pattern );

		if ( parts && parts.length > 1 ) {

			var animationName = parts[ 1 ];

			var animation = animations[ animationName ];
			if ( ! animation ) {
				animations[ animationName ] = animation = { name: animationName, morphTargetNames: [] };
				animationsArray.push( animation );
			}

			animation.morphTargetNames.push( morphTarget.name );
		}

	}

	var clips = [];

	for( var i = 0; i < animationsArray.length; i ++ ) {

		var animation = animationsArray[i];

		var clip = new THREE.AnimationClip.CreateMorphAnimationFromNames( animation.morphTargetNames, animation.morphTargetNames.length * fps );
		clip.name = animation.name;

		clips.push( clip );
	}

	return clips;

};

// parse the standard JSON format for clips
THREE.AnimationClip.parse = function( json ) {

	var name = json.name || "default";
	var duration = json.duration || -1;
	var fps = json.fps || 30;
	var animationTracks = json.tracks || [];

	var tracks = [];

	for( var i = 0; i < animationTracks.length; i ++ ) {

		tracks.push( THREE.KeyframeTrack.parse( animationTracks[i] ).scale( 1 / fps ) );

	}

	if( tracks.length === 0 ) return null;

	return new THREE.AnimationClip( name, duration, tracks );

};

// parse the old animation.hierarchy format
THREE.AnimationClip.parseAnimationHierarchy = function( animation, bones, nodeName ) {

	if( ! animation ) {
		console.error( "  no animation in JSONLoader data" );
		return null;
	}

	var convertTrack = function( trackName, animationKeys, propertyName, trackType, animationKeyToValueFunc ) {

		var keys = [];

		for( var k = 0; k < animationKeys.length; k ++ ) {

			var animationKey = animationKeys[k];

			if( animationKey[propertyName] !== undefined ) {

				keys.push( { time: animationKey.time, value: animationKeyToValueFunc( animationKey ) } );
			}
	
		}

		// only return track if there are actually keys.
		if( keys.length > 0 ) {
		
			return new trackType( trackName, keys );

		}

		return null;

	};

	var tracks = [];

	var clipName = animation.name || 'default';
	var duration = animation.length || -1; // automatic length determination in AnimationClip.
	var fps = animation.fps || 30;

	var hierarchyTracks = animation.hierarchy || [];

	for ( var h = 0; h < hierarchyTracks.length; h ++ ) {

		var animationKeys = hierarchyTracks[ h ].keys;

		// skip empty tracks
		if( ! animationKeys || animationKeys.length == 0 ) {
			continue;
		}

		// process morph targets in a way exactly compatible with AnimationHandler.init( animation )
		if( animationKeys[0].morphTargets ) {

			// figure out all morph targets used in this track
			var morphTargetNames = {};
			for( var k = 0; k < animationKeys.length; k ++ ) {

				if( animationKeys[k].morphTargets ) {
					for( var m = 0; m < animationKeys[k].morphTargets.length; m ++ ) {

						morphTargetNames[ animationKeys[k].morphTargets[m] ] = -1;
					}
				}

			}

			// create a track for each morph target with all zero morphTargetInfluences except for the keys in which the morphTarget is named.
			for( var morphTargetName in morphTargetNames ) {

				var keys = [];

				for( var m = 0; m < animationKeys[k].morphTargets.length; m ++ ) {

					var animationKey = animationKeys[k];

					keys.push( {
							time: animationKey.time,
							value: (( animationKey.morphTarget === morphTargetName ) ? 1 : 0 )
						});
				
				}

				tracks.push( new THREE.NumberKeyframeTrack( nodeName + '.morphTargetInfluence[' + morphTargetName + ']', keys ) );

			}

			duration = morphTargetNames.length * ( fps || 1.0 );

		}
		else {

			var boneName = nodeName + '.bones[' + bones[ h ].name + ']';
		
			// track contains positions...
			var positionTrack = convertTrack( boneName + '.position', animationKeys, 'pos', THREE.VectorKeyframeTrack, function( animationKey ) {
					return new THREE.Vector3().fromArray( animationKey.pos )
				} );

			if( positionTrack ) tracks.push( positionTrack );
			
			// track contains quaternions...
			var quaternionTrack = convertTrack( boneName + '.quaternion', animationKeys, 'rot', THREE.QuaternionKeyframeTrack, function( animationKey ) {
					if( animationKey.rot.slerp ) {
						return animationKey.rot.clone();
					}
					else {
						return new THREE.Quaternion().fromArray( animationKey.rot );
					}
				} );

			if( quaternionTrack ) tracks.push( quaternionTrack );

			// track contains quaternions...
			var scaleTrack = convertTrack( boneName + '.scale', animationKeys, 'scl', THREE.VectorKeyframeTrack, function( animationKey ) {
					return new THREE.Vector3().fromArray( animationKey.scl )
				} );

			if( scaleTrack ) tracks.push( scaleTrack );

		}
	}


	console.log( 'input animation', animation, 'resulting tracks', tracks );

	if( tracks.length === 0 ) {

		return null;

	}

	var clip = new THREE.AnimationClip( clipName, duration, tracks );

	return clip;

};

const {
  addReleaseSigning,
  applyVersionFromEnv,
  pinGradleVersion,
} = require('./withAndroidRelease');

// Excerpt of the app/build.gradle that `expo prebuild` generates with React Native 0.88.
const BUILD_GRADLE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

const WRAPPER = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-9.0.0-bin.zip
networkTimeout=10000
validateDistributionUrl=true
`;

describe('addReleaseSigning', () => {
  it('signs the release with the keystore from the environment, falling back to debug', () => {
    const result = addReleaseSigning(BUILD_GRADLE);

    expect(result).toContain("storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))");
    expect(result).toContain("keyPassword System.getenv('ANDROID_KEY_PASSWORD')");
    expect(result).toContain(
      "signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
    );
  });

  it('keeps the debug build type signed with the debug key', () => {
    const result = addReleaseSigning(BUILD_GRADLE);

    expect(result).toMatch(/debug \{\s*signingConfig signingConfigs\.debug\s*\}/);
  });

  it('is idempotent', () => {
    const once = addReleaseSigning(BUILD_GRADLE);

    expect(addReleaseSigning(once)).toBe(once);
  });

  it('fails loudly when the template changes', () => {
    expect(() => addReleaseSigning('android {}')).toThrow('unexpected app/build.gradle');
  });
});

describe('pinGradleVersion', () => {
  it('pins Gradle 9.4.1 with its checksum and keeps the other properties', () => {
    const result = pinGradleVersion(WRAPPER);

    expect(result).toContain(
      'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.4.1-bin.zip',
    );
    expect(result).toContain(
      'distributionSha256Sum=2ab2958f2a1e51120c326cad6f385153bb11ee93b3c216c5fccebfdfbb7ec6cb',
    );
    expect(result).toContain('networkTimeout=10000');
    expect(result).not.toContain('9.0.0');
  });

  it('does not duplicate the checksum when run twice', () => {
    const twice = pinGradleVersion(pinGradleVersion(WRAPPER));

    expect(twice.match(/distributionSha256Sum=/g)).toHaveLength(1);
  });
});

describe('applyVersionFromEnv', () => {
  const CONFIG = { version: '0.1.0', android: { package: 'app.perseida' } };

  it('sets versionName and versionCode from the environment and keeps the rest', () => {
    const result = applyVersionFromEnv(CONFIG, {
      ANDROID_VERSION_NAME: '1.2.3',
      ANDROID_VERSION_CODE: '42',
    });

    expect(result.version).toBe('1.2.3');
    expect(result.android).toEqual({ package: 'app.perseida', versionCode: 42 });
  });

  it('keeps app.json as it is without the variables (local builds)', () => {
    expect(applyVersionFromEnv(CONFIG, {})).toBe(CONFIG);
  });

  it.each([
    [{ ANDROID_VERSION_NAME: '1.2.3' }],
    [{ ANDROID_VERSION_CODE: '42' }],
    [{ ANDROID_VERSION_NAME: '1.2.3', ANDROID_VERSION_CODE: '0' }],
    [{ ANDROID_VERSION_NAME: '1.2.3', ANDROID_VERSION_CODE: 'abc' }],
  ])('fails loudly with incomplete or invalid values: %j', (env) => {
    expect(() => applyVersionFromEnv(CONFIG, env)).toThrow('invalid ANDROID_VERSION');
  });
});

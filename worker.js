// worker.js - Full Song Pink Noise Analyzer (25% Correction)

self.onmessage = function (e) {
    const { channelData, sampleRate } = e.data;

    const fftSize = 16384;
    const hopSize = fftSize / 2;

    const bands = [
        { name: "60", low: 40, high: 90, totalEnergy: 0 },
        { name: "120", low: 90, high: 180, totalEnergy: 0 },
        { name: "250", low: 180, high: 375, totalEnergy: 0 },
        { name: "500", low: 375, high: 750, totalEnergy: 0 },
        { name: "1000", low: 750, high: 1500, totalEnergy: 0 },
        { name: "2000", low: 1500, high: 3000, totalEnergy: 0 },
        { name: "4000", low: 3000, high: 6000, totalEnergy: 0 },
        { name: "8000", low: 6000, high: 12000, totalEnergy: 0 }
    ];

    const binResolution = sampleRate / fftSize;

    let frameCount = 0;

    for (
        let start = 0;
        start + fftSize <= channelData.length;
        start += hopSize
    ) {

        let real = new Float32Array(fftSize);
        let imag = new Float32Array(fftSize);

        for (let i = 0; i < fftSize; i++) {

            const windowValue =
                0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));

            real[i] =
                channelData[start + i] * windowValue;

            imag[i] = 0;
        }

        fft(real, imag);

        for (let i = 1; i < fftSize / 2; i++) {

            const freq = i * binResolution;

            const magnitude =
                Math.sqrt(
                    real[i] * real[i] +
                    imag[i] * imag[i]
                );

            const power =
                magnitude * magnitude;

            for (let b = 0; b < bands.length; b++) {

                if (
                    freq >= bands[b].low &&
                    freq < bands[b].high
                ) {
                    bands[b].totalEnergy += power;
                    break;
                }
            }
        }

        frameCount++;
    }

    bands.forEach(b => {

        const avgEnergy =
            frameCount > 0
                ? b.totalEnergy / frameCount
                : 0;

        b.db =
            avgEnergy > 0
                ? 10 * Math.log10(avgEnergy)
                : -120;
    });

    const validBands =
        bands.filter(b => b.db > -120);

    const avgDb =
        validBands.reduce(
            (sum, b) => sum + b.db,
            0
        ) / (validBands.length || 1);

    const referenceFreq = 60;

    const result = bands.map(b => {

        const centerFreq =
            parseFloat(b.name);

        const pinkTarget =
            avgDb -
            (3 * Math.log2(centerFreq / referenceFreq));

        let deviation =
            b.db - pinkTarget;

        // Dead zone ±1 dB
        if (Math.abs(deviation) < 1) {
            deviation = 0;
        }

        // Conservative correction (25%)
        const eq =
            (-deviation) * 0.25;

        return {
            band: b.name,
            energy: b.db,
            deviation: deviation,
            eq: eq
        };
    });

    self.postMessage(result);
};

function fft(real, imag) {

    const n = real.length;

    let target = 0;

    for (let position = 0; position < n; position++) {

        if (position < target) {

            let tempReal = real[position];
            let tempImag = imag[position];

            real[position] = real[target];
            imag[position] = imag[target];

            real[target] = tempReal;
            imag[target] = tempImag;
        }

        let mask = n >> 1;

        while (
            mask >= 1 &&
            (target & mask) !== 0
        ) {
            target ^= mask;
            mask >>= 1;
        }

        target ^= mask;
    }

    for (let len = 2; len <= n; len <<= 1) {

        let angle = -2 * Math.PI / len;

        let wlenReal = Math.cos(angle);
        let wlenImag = Math.sin(angle);

        for (let i = 0; i < n; i += len) {

            let wReal = 1.0;
            let wImag = 0.0;

            for (let j = 0; j < len / 2; j++) {

                const uReal = real[i + j];
                const uImag = imag[i + j];

                const vReal =
                    real[i + j + len / 2] * wReal -
                    imag[i + j + len / 2] * wImag;

                const vImag =
                    real[i + j + len / 2] * wImag +
                    imag[i + j + len / 2] * wReal;

                real[i + j] = uReal + vReal;
                imag[i + j] = uImag + vImag;

                real[i + j + len / 2] = uReal - vReal;
                imag[i + j + len / 2] = uImag - vImag;

                const nextWReal =
                    wReal * wlenReal -
                    wImag * wlenImag;

                wImag =
                    wReal * wlenImag +
                    wImag * wlenReal;

                wReal = nextWReal;
            }
        }
    }
}